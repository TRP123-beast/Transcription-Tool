import { readFile, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { config } from '../config'
import {
  extractAudioToWav,
  chunkAudio,
  getFileSizeBytes,
  mergeTranscripts,
} from './ffmpeg.service'

const CHUNK_THRESHOLD_BYTES = 150 * 1024 * 1024
const WHISPER_CHUNK_S = 30
const WHISPER_STRIDE_S = 5
const EFFECTIVE_STEP_S = WHISPER_CHUNK_S - WHISPER_STRIDE_S // 25s per internal chunk

let _pipeline: any = null

export async function warmupWhisper() {
  await getTranscriber()
}

async function getTranscriber() {
  if (_pipeline) return _pipeline

  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = config.whisper.cacheDir
  env.allowLocalModels = true

  const isGpu = config.whisper.device !== 'auto'
  console.log(`[whisper] Loading model: ${config.whisper.model} | device: ${isGpu ? config.whisper.device : 'cpu'} | dtype: ${config.whisper.dtype}`)
  _pipeline = await pipeline('automatic-speech-recognition', config.whisper.model, {
    ...(isGpu && { device: config.whisper.device as any }),
    dtype: config.whisper.dtype as any,
  })
  console.log('[whisper] Model ready.')

  return _pipeline
}

async function readPcmWav(filePath: string): Promise<Float32Array> {
  const buf = await readFile(filePath)

  let dataOffset = 44
  for (let i = 12; i < buf.length - 8; i++) {
    if (buf[i] === 0x64 && buf[i + 1] === 0x61 && buf[i + 2] === 0x74 && buf[i + 3] === 0x61) {
      dataOffset = i + 8
      break
    }
  }

  const numSamples = (buf.length - dataOffset) / 2
  const float32 = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    float32[i] = buf.readInt16LE(dataOffset + i * 2) / 32768.0
  }
  return float32
}

export async function transcribeFile(filePath: string, label?: string): Promise<string> {
  const tag = label ?? filePath.split(/[\\/]/).pop()
  const workDir = join(tmpdir(), `transcription-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })

  const start = Date.now()
  console.log(`[whisper] Starting: ${tag}`)

  try {
    console.log(`[whisper] Extracting audio...`)
    const audioPath = await extractAudioToWav(filePath, workDir)
    const audioSize = await getFileSizeBytes(audioPath)

    const durationSec = audioSize / (16000 * 2)
    const durationMin = (durationSec / 60).toFixed(1)
    const estimatedChunks = Math.ceil(durationSec / EFFECTIVE_STEP_S)

    console.log(`[whisper] Audio: ${(audioSize / 1024 / 1024).toFixed(1)}MB | ~${durationMin} min | ~${estimatedChunks} Whisper windows (30s each)`)

    let transcript: string

    if (audioSize <= CHUNK_THRESHOLD_BYTES) {
      console.log(`[whisper] Processing as single file (no FFmpeg splitting needed)...`)

      const elapsed = () => ((Date.now() - start) / 1000 / 60).toFixed(1)
      const heartbeat = setInterval(() => {
        console.log(`[whisper] Still processing... ${elapsed()} min elapsed`)
      }, 30_000)

      try {
        transcript = await runWhisper(audioPath)
      } finally {
        clearInterval(heartbeat)
      }
    } else {
      // Large file — split into file-level chunks and process sequentially
      const chunks = await chunkAudio(audioPath, workDir)
      console.log(`[whisper] Split into ${chunks.length} file chunks`)

      const texts: string[] = []
      for (const [i, chunk] of chunks.entries()) {
        const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1)
        console.log(`[whisper] File chunk ${i + 1}/${chunks.length} — ${elapsed} min elapsed`)
        texts.push(await runWhisper(chunk.path))
      }
      transcript = mergeTranscripts(texts)
    }

    const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1)
    console.log(`[whisper] Done in ${elapsed} min — ${transcript.split(' ').length} words`)
    return transcript
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function runWhisper(audioPath: string): Promise<string> {
  const transcriber = await getTranscriber()
  const audio = await readPcmWav(audioPath)

  const result = await transcriber(audio, {
    chunk_length_s: WHISPER_CHUNK_S,
    stride_length_s: WHISPER_STRIDE_S,
    return_timestamps: false,
    language: 'english',
  })

  return (result.text as string).trim()
}
