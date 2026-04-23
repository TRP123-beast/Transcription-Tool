import { spawn } from 'child_process'
import { stat } from 'fs/promises'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'
import { config } from '../config'

const FFMPEG = ffmpegPath as string

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args)
    const stderr: string[] = []
    proc.stderr.on('data', (d) => stderr.push(d.toString()))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-3).join('')}`))
    })
  })
}

function probe(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-i', filePath, '-f', 'null', '-'])
    const output: string[] = []
    proc.stderr.on('data', (d) => output.push(d.toString()))
    proc.on('close', () => {
      const match = output.join('').match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
      if (!match) return reject(new Error('Could not determine duration'))
      const [, h, m, s] = match
      resolve(parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s))
    })
  })
}

export interface AudioChunk {
  path: string
  index: number
}

export async function extractAudioToWav(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = join(outputDir, 'audio.wav')
  await run([
    '-i', inputPath,
    '-vn',                // no video
    '-ac', '1',          // mono
    '-ar', '16000',      // 16kHz — Whisper's native rate
    '-acodec', 'pcm_s16le',
    '-y', outputPath,
  ])
  return outputPath
}

export async function chunkAudio(audioPath: string, outputDir: string): Promise<AudioChunk[]> {
  const duration = await probe(audioPath)
  const chunkDuration = config.ffmpeg.chunkDurationSeconds
  const overlap = config.ffmpeg.overlapSeconds
  const chunks: AudioChunk[] = []

  let start = 0
  let index = 0

  while (start < duration) {
    const outputPath = join(outputDir, `chunk_${index}.wav`)
    await run([
      '-ss', String(start),
      '-i', audioPath,
      '-t', String(chunkDuration + overlap),
      '-ac', '1',
      '-ar', '16000',
      '-acodec', 'pcm_s16le',
      '-y', outputPath,
    ])
    chunks.push({ path: outputPath, index })
    start += chunkDuration
    index++
  }

  return chunks
}

export async function getFileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size
}

export function mergeTranscripts(texts: string[]): string {
  if (texts.length === 0) return ''
  if (texts.length === 1) return texts[0].trim()

  let merged = texts[0].trim()

  for (let i = 1; i < texts.length; i++) {
    const curr = texts[i].trim()
    if (!curr) continue

    const prevWords = merged.split(' ').slice(-10)
    let overlapFound = false

    for (let w = Math.min(prevWords.length, 6); w >= 2; w--) {
      const tail = prevWords.slice(-w).join(' ').toLowerCase()
      const headIndex = curr.toLowerCase().indexOf(tail)
      if (headIndex !== -1) {
        merged += ' ' + curr.slice(headIndex + tail.length).trim()
        overlapFound = true
        break
      }
    }

    if (!overlapFound) merged += ' ' + curr
  }

  return merged.trim()
}
