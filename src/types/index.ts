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
  headers?: Record<string, string>
  // If provided: return 202 immediately and POST result to this URL when done
  callbackUrl?: string
}
