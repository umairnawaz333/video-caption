# Captionly — AI Video Captioning (100% free & local)

Upload a video → local Whisper AI generates English captions → style them with a
live preview → download the video with captions burned in. No accounts, no cloud,
no paid APIs. Files are auto-deleted after download (1-hour TTL backstop).

## Stack

- **frontend/** Next.js + React + Tailwind — dashboard, style controls, live preview
- **backend/** NestJS — upload (Multer), FFmpeg pipeline, ASS subtitle generation
- **transcriber/** Python + [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — local speech-to-text
- **fonts/** OFL-licensed caption fonts (Anton, Bangers) used by FFmpeg at burn time

Non-English speech is translated to English captions by Whisper itself (free).

## Prerequisites

- Node 20+, Python 3.10+, FFmpeg (`brew install ffmpeg`) — the ffmpeg build must include libass (the `ass` filter); if yours doesn't, use a full build such as the `ffmpeg-full` formula

## Setup

    # transcriber (one-time; first run downloads the Whisper model ~150 MB)
    cd transcriber && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

    # backend
    cd ../backend && npm install
    PYTHON_BIN=../transcriber/.venv/bin/python npm run start:dev   # http://localhost:4000

    # frontend
    cd ../frontend && npm install && npm run dev                   # http://localhost:3000

## Configuration (env, all optional)

| Var | Default | Purpose |
|---|---|---|
| `WHISPER_MODEL` | `base` | tiny/base/small/medium — bigger = slower + more accurate |
| `PYTHON_BIN` | `python3` | python with faster-whisper installed |
| `MAX_UPLOAD_MB` | `500` | upload size limit |
| `JOB_TTL_MS` | `3600000` | temp-file sweeper TTL |

## Tests

    cd backend && npx jest && npx jest --config test/jest-e2e.json
    cd frontend && npm test
