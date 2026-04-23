import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { config } from './config'
import { transcriptionRoutes } from './routes/transcription'

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
    console.log('  POST /api/transcribe        — upload audio/video file')
    console.log('  GET  /api/jobs              — list all jobs')
    console.log('  GET  /api/jobs/:id          — job status')
    console.log('  GET  /api/jobs/:id/result   — get transcript')
    console.log('  GET  /api/health            — health check')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
