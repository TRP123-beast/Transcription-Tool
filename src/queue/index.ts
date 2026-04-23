import PQueue from 'p-queue'
import { rm } from 'fs/promises'
import { transcribeFile } from '../services/whisper.service'
import { updateJobStatus } from '../services/supabase.service'

export interface JobPayload {
  jobId: string
  filePath: string
  fileName: string
}

// Concurrency 1 — process one transcription at a time
const queue = new PQueue({ concurrency: 1 })

export function getQueueStats() {
  return {
    pending: queue.size,
    running: queue.pending,
  }
}

export async function enqueueJob(payload: JobPayload): Promise<void> {
  queue.add(() => processJob(payload))
}

async function processJob(payload: JobPayload): Promise<void> {
  const { jobId, filePath, fileName } = payload

  try {
    console.log(`[queue] Processing job ${jobId} — ${fileName}`)
    await updateJobStatus(jobId, 'processing')

    const transcript = await transcribeFile(filePath)

    await updateJobStatus(jobId, 'completed', { transcript })
    console.log(`[queue] Completed job ${jobId}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[queue] Failed job ${jobId}: ${message}`)
    await updateJobStatus(jobId, 'failed', { error: message })
  } finally {
    // Delete the uploaded temp file after processing
    await rm(filePath, { force: true })
  }
}
