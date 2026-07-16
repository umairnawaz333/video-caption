# Video Caption

A free, open-source web app for adding AI-generated captions to videos. Upload a video, edit transcribed captions, style them with customizable fonts and colors, and download the captioned MP4. All processing runs locally—no paid APIs, no cloud uploads.

## Features

- **AI Transcription:** Generate accurate English captions from any video (including non-English speech, auto-translated to English).
- **Style & Preview:** Choose from preset styles or customize fonts, sizes, colors, backgrounds, and positioning with live preview.
- **Edit Transcripts:** Fix typos and edit caption timing inline before exporting.
- **Export & Download:** Burn styled captions directly into your MP4 using FFmpeg.
- **Privacy:** No accounts, no permanent storage—temp files are deleted after download.
- **Free:** All processing is local (Whisper, FFmpeg). Zero paid API calls.

## Tech Stack

- **Frontend:** Next.js + React + Tailwind (dark dashboard, live video preview)
- **Backend:** NestJS + Multer (job management, transcription pipeline, export)
- **Transcription:** faster-whisper (Python sidecar, local inference)
- **Rendering:** FFmpeg + ASS subtitles

## Prerequisites

- **Node.js** 20 or higher
- **Python** 3.10 or higher
- **FFmpeg** (with libass support for subtitle burning)

### Install FFmpeg

**macOS (via Homebrew):**
```bash
brew install ffmpeg-full
```

**Ubuntu/Debian:**
```bash
apt-get install ffmpeg libass-dev
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use [Chocolatey](https://chocolatey.org/):
```bash
choco install ffmpeg
```

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/umairnawaz333/video-caption.git
cd video-caption

# Frontend
cd frontend
npm install

# Backend (in a new terminal)
cd ../backend
npm install

# Transcriber (in a new terminal)
cd ../transcriber
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run Development Servers

**Frontend** (localhost:3000):
```bash
cd frontend
npm run dev
```

**Backend** (localhost:3001):
```bash
cd backend
npm run start:dev
```

The frontend will automatically proxy API calls to the backend.

### 3. Open in Browser

Visit [http://localhost:3000](http://localhost:3000) and start captioning!

## Project Structure

```
frontend/       Next.js app (UI, style controls, preview)
backend/        NestJS API (jobs, transcription, export)
transcriber/    Python CLI (faster-whisper wrapper)
tmp/            Ephemeral job directories (gitignored)
docs/           Design specs and plans
```

## Usage

1. **Upload** a video (MP4, MOV, AVI; up to 500 MB default)
2. **Wait** for transcription (polling shows progress)
3. **Edit & Style** captions with the studio editor
4. **Export** to burn captions into the video
5. **Download** the captioned MP4

Temp files auto-delete after download (or after 1 hour, whichever comes first).

## Building for Production

```bash
# Frontend
cd frontend
npm run build
npm run start

# Backend
cd backend
npm run build
npm run start:prod
```

Optionally deploy with Docker Compose (Nginx reverse proxy, single container for backend+FFmpeg+Python).

## Testing

```bash
# Frontend
cd frontend
npm test

# Backend
cd backend
npm test
npm run test:e2e
```

## Environment Variables

**Backend** (create `.env` in `backend/`):
```
PORT=3001
WHISPER_MODEL=base
UPLOAD_LIMIT_MB=500
TTL_HOURS=1
```

**Transcriber** (optional in `transcriber/`):
```
WHISPER_CACHE_DIR=~/.cache/huggingface/hub
```

## Troubleshooting

**"FFmpeg not found":** Ensure FFmpeg is installed and in your PATH.
```bash
ffmpeg -version
```

**"No audio track found" error:** Video must contain an audio stream. Re-encode with ffmpeg if needed.

**Transcription is slow:** First run downloads the Whisper model (~150 MB). Subsequent runs are faster. For CPU-only systems, allow 5–10 minutes for typical videos.

## License

MIT License © 2026 Umair Nawaz

See [LICENSE](./LICENSE) for details.

## Contributing

Pull requests welcome! For major changes, open an issue first to discuss.

---

**Questions or feedback?** Open an issue on GitHub.
