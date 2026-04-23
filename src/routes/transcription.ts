import type { FastifyInstance } from 'fastify'
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { enqueueJob, getQueueStats } from '../queue'
import { createJob, getJob, listJobs } from '../services/supabase.service'
import { transcribeFile } from '../services/whisper.service'
import type { TranscribeUrlPayload } from '../types'

async function downloadToTemp(url: string, fileName: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Failed to download file: ${res.status} ${res.statusText}`)

  const uploadDir = join(tmpdir(), 'transcription-uploads')
  await mkdir(uploadDir, { recursive: true })

  const ext = fileName.split('.').pop() ?? 'bin'
  const tempPath = join(uploadDir, `${uuidv4()}.${ext}`)

  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tempPath))
  return tempPath
}

export async function transcriptionRoutes(fastify: FastifyInstance) {

  // POST /api/transcribe/sync — upload file directly, get transcript back immediately
  fastify.post('/api/transcribe/sync', async (request, reply) => {
    const upload = await request.file({ limits: { fileSize: config.upload.maxFileSizeBytes } })

    if (!upload) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    if (!config.upload.allowedMimeTypes.has(upload.mimetype)) {
      return reply.status(415).send({
        error: 'Unsupported file type',
        supported: 'Audio (mp3, wav, ogg, flac, aac, m4a) and Video (mp4, mov, avi, mkv, webm)',
      })
    }

    const uploadDir = join(tmpdir(), 'transcription-uploads')
    await mkdir(uploadDir, { recursive: true })

    const ext = upload.filename.split('.').pop() ?? 'bin'
    const tempPath = join(uploadDir, `${uuidv4()}.${ext}`)

    try {
      await pipeline(upload.file, createWriteStream(tempPath))
      const transcript = await transcribeFile(tempPath)
      return { fileName: upload.filename, transcript }
    } finally {
      await rm(tempPath, { force: true })
    }
  })

  // POST /api/transcribe/url — receive JSON with file link, download and transcribe
  fastify.post<{ Body: TranscribeUrlPayload }>('/api/transcribe/url', async (req, reply) => {
    const body = req.body

    if (!body?.link || !body?.fileName) {
      return reply.status(400).send({ error: 'Missing required fields: link, fileName' })
    }

    let tempPath: string | null = null
    try {
      tempPath = await downloadToTemp(body.link, body.fileName, body.headers)
      const transcript = await transcribeFile(tempPath, body.fileName)

      console.log('\n─────────────────────────────────────────')
      console.log(`[transcript] ${body.fileName}`)
      console.log('─────────────────────────────────────────')
      console.log(transcript)
      console.log('─────────────────────────────────────────\n')

      return {
        meetingId: body.meetingId ?? null,
        fileName: body.fileName,
        roomName: body.roomName ?? null,
        participants: body.participants ?? [],
        durationSeconds: body.durationSeconds ?? null,
        completedAt: body.completedAt ?? null,
        transcript,
      }
    } finally {
      if (tempPath) await rm(tempPath, { force: true })
    }
  })

  // POST /api/transcribe — async with queue + Supabase job tracking (for long files)
  fastify.post('/api/transcribe', async (request, reply) => {
    if (!config.supabase.enabled) {
      return reply.status(503).send({
        error: 'Async transcription requires Supabase. Use POST /api/transcribe/sync or /api/transcribe/url instead.',
      })
    }

    const upload = await request.file({ limits: { fileSize: config.upload.maxFileSizeBytes } })

    if (!upload) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    if (!config.upload.allowedMimeTypes.has(upload.mimetype)) {
      return reply.status(415).send({
        error: 'Unsupported file type',
        supported: 'Audio (mp3, wav, ogg, flac, aac, m4a) and Video (mp4, mov, avi, mkv, webm)',
      })
    }

    const uploadDir = join(tmpdir(), 'transcription-uploads')
    await mkdir(uploadDir, { recursive: true })

    const ext = upload.filename.split('.').pop() ?? 'bin'
    const tempPath = join(uploadDir, `${uuidv4()}.${ext}`)
    await pipeline(upload.file, createWriteStream(tempPath))

    const jobId = uuidv4()
    await createJob(jobId, upload.filename)
    await enqueueJob({ jobId, filePath: tempPath, fileName: upload.filename })

    return reply.status(202).send({
      jobId,
      status: 'pending',
      message: 'File received and queued for transcription. Poll GET /api/jobs/:id/result for the transcript.',
    })
  })

  // GET /api/jobs — list all jobs (requires Supabase)
  fastify.get('/api/jobs', async (request, reply) => {
    if (!config.supabase.enabled) {
      return reply.status(503).send({ error: 'Job tracking requires Supabase. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env' })
    }
    const jobs = await listJobs()
    return { jobs, queue: getQueueStats() }
  })

  // GET /api/jobs/:id — job status
  fastify.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    if (!config.supabase.enabled) {
      return reply.status(503).send({ error: 'Job tracking requires Supabase' })
    }
    const job = await getJob(request.params.id)
    if (!job) return reply.status(404).send({ error: 'Job not found' })

    return {
      jobId: job.id,
      status: job.status,
      fileName: job.file_name,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }
  })

  // GET /api/jobs/:id/result — full transcript
  fastify.get<{ Params: { id: string } }>('/api/jobs/:id/result', async (request, reply) => {
    if (!config.supabase.enabled) {
      return reply.status(503).send({ error: 'Job tracking requires Supabase' })
    }
    const job = await getJob(request.params.id)
    if (!job) return reply.status(404).send({ error: 'Job not found' })

    if (job.status === 'pending' || job.status === 'processing') {
      return reply.status(202).send({
        jobId: job.id,
        status: job.status,
        message: 'Transcription is still in progress',
      })
    }

    return {
      jobId: job.id,
      status: job.status,
      fileName: job.file_name,
      transcript: job.transcript ?? null,
      error: job.error ?? null,
    }
  })

  // GET /api/health
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      supabase: config.supabase.enabled ? 'connected' : 'not configured (sync only)',
      queue: getQueueStats(),
    }
  })
}
