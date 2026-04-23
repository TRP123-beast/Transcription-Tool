# Transcription Tool

Audio and video transcription API powered by OpenAI Whisper running **100% locally** — no API keys, no cost.

## Features

- Accepts audio and video files (mp3, wav, ogg, flac, aac, m4a, mp4, mov, avi, mkv, webm)
- Extracts and converts audio from video files automatically via FFmpeg
- Handles files of any length by chunking and merging transcripts
- Processes one job at a time via an in-memory queue
- Job status tracked in Supabase (free tier)

## Stack

| Layer | Package |
|---|---|
| API server | Fastify 5 |
| Transcription | `@huggingface/transformers` (Whisper, runs locally) |
| Audio processing | FFmpeg via `ffmpeg-static` |
| Queue | `p-queue` (concurrency: 1) |
| Database | Supabase (Postgres) |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your Supabase credentials in `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Create database table

Run the contents of `schema.sql` in your Supabase SQL editor.

### 4. Start the server

```bash
npm run dev
```

On first run, the Whisper model is downloaded and cached in `./models/` (~500MB for `whisper-small`). Subsequent starts are instant.

## API Endpoints

### `POST /api/transcribe`

Upload an audio or video file for transcription.

**Request:** `multipart/form-data` with a `file` field.

```bash
curl -X POST http://localhost:3000/api/transcribe \
  -F "file=@recording.mp4"
```

**Response:**
```json
{
  "jobId": "abc-123",
  "status": "pending",
  "message": "File received and queued for transcription"
}
```

---

### `GET /api/jobs/:id`

Check the status of a transcription job.

```bash
curl http://localhost:3000/api/jobs/abc-123
```

**Response:**
```json
{
  "jobId": "abc-123",
  "status": "processing",
  "fileName": "recording.mp4",
  "createdAt": "2026-04-22T09:00:00Z",
  "updatedAt": "2026-04-22T09:00:05Z"
}
```

Possible statuses: `pending` | `processing` | `completed` | `failed`

---

### `GET /api/jobs/:id/result`

Retrieve the transcript once the job is complete.

```bash
curl http://localhost:3000/api/jobs/abc-123/result
```

**Response:**
```json
{
  "jobId": "abc-123",
  "status": "completed",
  "fileName": "recording.mp4",
  "transcript": "Hello, this is the transcribed text...",
  "error": null
}
```

---

### `GET /api/jobs`

List all jobs (latest 100).

```bash
curl http://localhost:3000/api/jobs
```

---

### `GET /api/health`

Health check with queue stats.

```bash
curl http://localhost:3000/api/health
```

## Whisper Models

Configure via `WHISPER_MODEL` in `.env`:

| Model | Size | Speed | Accuracy |
|---|---|---|---|
| `Xenova/whisper-tiny` | ~75MB | Very fast | Good |
| `Xenova/whisper-base` | ~145MB | Fast | Better |
| `Xenova/whisper-small` | ~250MB | Medium | Great (default) |
| `Xenova/whisper-medium` | ~770MB | Slow | Excellent |
| `Xenova/whisper-large-v3` | ~1.5GB | Very slow | Best |

## Supported File Types

**Audio:** mp3, wav, ogg, flac, aac, m4a, opus, webm  
**Video:** mp4, mov, avi, mkv, webm, 3gp, mpeg
