import type { FastifyInstance } from 'fastify'
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { config } from '../config'
import { transcribeFile } from '../services/whisper.service'
import type { TranscribeUrlPayload } from '../types'

async function downloadToTemp(url: string, fileName: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Failed to download file: ${res.status} ${res.statusText}`)

  const uploadDir = join(tmpdir(), 'transcription-uploads')
  await mkdir(uploadDir, { recursive: true })

  const ext = fileName.split('.').pop() ?? 'bin'
  const tempPath = join(uploadDir, `${randomUUID()}.${ext}`)

  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tempPath))
  return tempPath
}

export async function transcriptionRoutes(fastify: FastifyInstance) {

  // POST /api/transcribe/url — receive JSON with file link, download and transcribe
  fastify.post<{ Body: TranscribeUrlPayload }>('/api/transcribe/url', async (req, reply) => {
    const body = req.body

    if (!body?.link || !body?.fileName) {
      return reply.status(400).send({ error: 'Missing required fields: link, fileName' })
    }

    const result = () => ({
      meetingId: body.meetingId ?? null,
      fileName: body.fileName,
      roomName: body.roomName ?? null,
      participants: body.participants ?? [],
      durationSeconds: body.durationSeconds ?? null,
      completedAt: body.completedAt ?? null,
    })

    // Webhook mode — return 202 immediately, POST result to callbackUrl when done
    if (body.callbackUrl) {
      reply.status(202).send({ message: 'Transcription started', fileName: body.fileName })

      // Process in background (don't await)
      ;(async () => {
        let tempPath: string | null = null
        try {
          tempPath = await downloadToTemp(body.link, body.fileName, body.headers)
          const transcript = await transcribeFile(tempPath, body.fileName)

          console.log('\n─────────────────────────────────────────')
          console.log(`[transcript] ${body.fileName}`)
          console.log('─────────────────────────────────────────')
          console.log(transcript)
          console.log('─────────────────────────────────────────\n')

          await fetch(body.callbackUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...result(), transcript }),
          })
          console.log(`[webhook] Result sent to ${body.callbackUrl}`)
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          console.error(`[webhook] Failed: ${error}`)
          await fetch(body.callbackUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...result(), error }),
          }).catch(() => {})
        } finally {
          if (tempPath) await rm(tempPath, { force: true })
        }
      })()

      return
    }

    // Sync mode — wait and return transcript directly
    let tempPath: string | null = null
    try {
      tempPath = await downloadToTemp(body.link, body.fileName, body.headers)
      const transcript = await transcribeFile(tempPath, body.fileName)

      console.log('\n─────────────────────────────────────────')
      console.log(`[transcript] ${body.fileName}`)
      console.log('─────────────────────────────────────────')
      console.log(transcript)
      console.log('─────────────────────────────────────────\n')

      return { ...result(), transcript }
    } finally {
      if (tempPath) await rm(tempPath, { force: true })
    }
  })

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
    const tempPath = join(uploadDir, `${randomUUID()}.${ext}`)

    try {
      await pipeline(upload.file, createWriteStream(tempPath))
      const transcript = await transcribeFile(tempPath, upload.filename)
      return { fileName: upload.filename, transcript }
    } finally {
      await rm(tempPath, { force: true })
    }
  })

  // Root route — required for Render health checks (HEAD /)
  fastify.get('/', async () => ({ status: 'ok' }))
  fastify.head('/', async () => {})

  // GET /api/health
  fastify.get('/api/health', async () => {
    return { status: 'ok' }
  })
}
