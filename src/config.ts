import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',

  // Supabase is optional — only needed for async job tracking (/api/transcribe)
  // Sync endpoint (/api/transcribe/sync) works without it
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    enabled: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  },

  whisper: {
    // Options: Xenova/whisper-tiny | whisper-base | whisper-small | whisper-medium | whisper-large-v3
    model: process.env.WHISPER_MODEL ?? 'Xenova/whisper-small',
    // Models are downloaded once and cached here
    cacheDir: process.env.WHISPER_CACHE_DIR ?? './models',
  },

  ffmpeg: {
    audioBitrate: '128k',
    chunkDurationSeconds: 600,  // 10 min chunks
    overlapSeconds: 10,
  },

  upload: {
    maxFileSizeBytes: 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: new Set([
      // Audio
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
      'audio/webm', 'audio/opus',
      // Video
      'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime',
      'video/x-msvideo', 'video/x-matroska', 'video/3gpp',
    ]),
  },
} as const
