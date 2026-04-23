import { createClient } from '@supabase/supabase-js'
import { config } from '../config'
import type { JobStatus, TranscriptionJob } from '../types'

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey)

export async function createJob(id: string, fileName: string): Promise<void> {
  const { error } = await supabase.from('transcription_jobs').insert({
    id,
    status: 'pending',
    file_name: fileName,
  })
  if (error) throw new Error(`Failed to create job: ${error.message}`)
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  fields: { transcript?: string; error?: string } = {}
): Promise<void> {
  const { error } = await supabase
    .from('transcription_jobs')
    .update({ status, ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Failed to update job: ${error.message}`)
}

export async function getJob(id: string): Promise<TranscriptionJob | null> {
  const { data, error } = await supabase
    .from('transcription_jobs')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as TranscriptionJob
}

export async function listJobs(): Promise<TranscriptionJob[]> {
  const { data, error } = await supabase
    .from('transcription_jobs')
    .select('id, status, file_name, error, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`Failed to list jobs: ${error.message}`)
  return (data ?? []) as TranscriptionJob[]
}
