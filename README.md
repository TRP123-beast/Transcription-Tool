# Transcription Tool

Audio and video transcription API powered by OpenAI Whisper running **100% locally** — no API keys, no cost.

## Features

- Accepts audio and video files (mp3, wav, ogg, flac, aac, m4a, mp4, mov, avi, mkv, webm)
- Extracts and converts audio from video files automatically via FFmpeg
- Handles files of any length by chunking and merging transcripts
- URL-based transcription — send a link, get a transcript back
- Webhook mode — returns 202 immediately, POSTs result to your callback URL when done (ideal for n8n)

## Stack

| Layer | Package |
|---|---|
| API server | Fastify 5 |
| Transcription | `@huggingface/transformers` (Whisper, runs locally) |
| Audio processing | FFmpeg via `ffmpeg-static` |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Start the server

```bash
npm run dev
```

On first run, the Whisper model is downloaded and cached in `./models/`. Subsequent starts are instant.

## API Endpoints

### `POST /api/transcribe/url`

Transcribe from a URL. Supports webhook mode for long files.

**Sync mode** — waits and returns transcript directly:

```bash
curl -X POST https://your-server/api/transcribe/url \
  -H "Content-Type: application/json" \
  -d '{
    "type": "audio",
    "link": "https://example.com/recording.wav",
    "fileName": "recording.wav",
    "roomName": "Room 1",
    "participants": ["Alice", "Bob"],
    "meetingId": "abc-123"
  }'
```

**Webhook mode** — returns `202` immediately, POSTs result to `callbackUrl` when done:

```json
{
  "type": "audio",
  "link": "https://example.com/recording.wav",
  "fileName": "recording.wav",
  "meetingId": "abc-123",
  "callbackUrl": "https://your-n8n/webhook/transcription-result"
}
```

**Response:**
```json
{
  "meetingId": "abc-123",
  "fileName": "recording.wav",
  "roomName": "Room 1",
  "participants": ["Alice", "Bob"],
  "durationSeconds": 1097,
  "completedAt": "2026-04-23T08:56:26.473Z",
  "transcript": "Hello, this is the transcribed text..."
}
```

---

### `POST /api/transcribe/sync`

Upload a file directly and get the transcript back immediately.

```bash
curl -X POST https://your-server/api/transcribe/sync \
  -F "file=@recording.wav"
```

**Response:**
```json
{
  "fileName": "recording.wav",
  "transcript": "Hello, this is the transcribed text..."
}
```

---

### `GET /api/health`

```bash
curl https://your-server/api/health
# { "status": "ok" }
```

## Whisper Models

Configure via `WHISPER_MODEL` in `.env`:

| Model | RAM needed | Speed | Accuracy |
|---|---|---|---|
| `Xenova/whisper-tiny` | ~250MB | Very fast | Good |
| `Xenova/whisper-base` | ~390MB | Fast | Better |
| `Xenova/whisper-small` | ~600MB | Medium | Great |
| `Xenova/whisper-medium` | ~1.5GB | Slow | Excellent |
| `Xenova/whisper-large-v3` | ~3GB | Very slow | Best |

> **Render free tier (512MB):** use `whisper-tiny` only.  
> **Render Starter ($7/mo, 2GB):** `whisper-small` works comfortably.

## Supported File Types

**Audio:** mp3, wav, ogg, flac, aac, m4a, opus, webm  
**Video:** mp4, mov, avi, mkv, webm, 3gp, mpeg
