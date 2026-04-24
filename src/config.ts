import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',

  whisper: {
    model: process.env.WHISPER_MODEL ?? 'Xenova/whisper-small',
    cacheDir: process.env.WHISPER_CACHE_DIR ?? './models',
    // CPU: 'auto' | GPU: 'cuda' (NVIDIA) | 'webgpu'
    device: process.env.WHISPER_DEVICE ?? 'auto',
    // CPU: 'q8' (quantized) | GPU: 'fp16' | 'fp32'
    dtype: process.env.WHISPER_DTYPE ?? 'q8',
  },

  upload: {
    maxFileSizeBytes: 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: new Set([
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
      'audio/webm', 'audio/opus',
      'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime',
      'video/x-msvideo', 'video/x-matroska', 'video/3gpp',
    ]),
  },
} as const
