import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { config } from './config'
import { transcriptionRoutes } from './routes/transcription'
import { warmupWhisper } from './services/whisper.service'

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
})

fastify.register(multipart)
fastify.register(transcriptionRoutes)

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host })
    console.log(`Transcription API running on http://localhost:${config.port}`)
    console.log('Endpoints:')
    console.log('  POST /api/transcribe/url  — transcribe from URL (webhook mode supported)')
    console.log('  POST /api/transcribe/sync — upload file directly')
    console.log('  GET  /api/health          — health check')

    // Load model in background after server is up so health checks pass
    warmupWhisper().catch((err) => console.error('[whisper] Warmup failed:', err))
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
