export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface TranscribeUrlPayload {
  type: 'audio' | 'video'
  link: string
  fileName: string
  relativePath?: string
  roomName?: string
  botName?: string | null
  participants?: string[]
  durationSeconds?: number
  sizeBytes?: number
  meetingId?: string
  completedAt?: string
  headers?: Record<string, string>  // optional auth/custom headers for the download request
}

export interface TranscriptionJob {
  id: string
  status: JobStatus
  file_name: string
  file_url: string | null
  transcript: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface EnqueueJobPayload {
  jobId: string
  filePath: string
  fileName: string
  mimeType: string
}

export interface TranscribeResponse {
  jobId: string
  status: JobStatus
  message: string
}

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  fileName: string
  createdAt: string
  updatedAt: string
}

export interface JobResultResponse {
  jobId: string
  status: JobStatus
  fileName: string
  transcript: string | null
  error: string | null
}
