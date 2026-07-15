# AI Video Captioning MVP — Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Constraint:** 100% free — no paid API calls. All processing local (FFmpeg + faster-whisper).

## Overview

A web app where a user uploads a video, gets AI-generated English captions,
styles them (font, size, colors, rounded background, position) with a live
preview, and downloads the video with captions burned in. No accounts, no
permanent storage; temp files are deleted after processing.

## Goals (v1)

- Upload a local video (MP4, MOV, AVI; size-limited)
- Generate timestamped English captions locally with faster-whisper
  - Non-English speech: Whisper `task=translate` outputs English captions (free, built-in)
- Style captions: presets + font, size, text color, rounded background box
  (color/opacity), outline/shadow toggle, position (top/middle/bottom + offset)
- Live preview: HTML5 player with captions overlaid as styled DOM elements,
  synced to timestamps — instant style feedback, no server re-render
- Edit transcript segments before export (fix typos)
- Export: burn styled captions into MP4 via FFmpeg + `.ass` subtitles; download
- Auto-delete temp files after download (plus TTL sweeper backstop)

## Non-Goals (v1) — architecture leaves room for these

- Multiple simultaneous caption tracks (e.g. English + Urdu together)
- Translating captions into other common languages (LibreTranslate later)
- User accounts, saved projects, cloud storage, payments, queues (Redis/BullMQ)

## Architecture

Monorepo `Video-caption/` — single GitHub repo under `umairnawaz333`:

```
frontend/     Next.js + React + Tailwind — dashboard, upload, style controls, preview
backend/      NestJS + Multer — upload, jobs, transcription, rendering, download
transcriber/  Python sidecar — faster-whisper CLI script (invoked by backend)
tmp/          per-job working dirs, auto-deleted (gitignored)
docs/         specs and plans
```

### Processing flow

```
Browser → POST /api/upload (multipart)
  → backend saves to tmp/<jobId>/input.<ext>
  → FFmpeg: extract audio → audio.wav (16 kHz mono PCM)
  → spawn python transcriber/transcribe.py audio.wav → JSON segments to stdout
  → job status: "ready" with transcript
Browser: style + edit transcript (live overlay preview, no server calls)
Browser → POST /api/jobs/:id/export { style, segments }
  → backend generates captions.ass from segments + style
  → FFmpeg: burn with ass filter → output.mp4
  → job status: "done"
Browser → GET /api/jobs/:id/download → output.mp4
  → temp files deleted after response completes (+ TTL sweeper, e.g. 1 h)
```

### Whisper sidecar (Option A — chosen)

- `transcriber/transcribe.py`: args `--audio <path> --model base --task transcribe|translate`;
  prints `{ language, segments: [{ start, end, text }] }` JSON to stdout.
- `faster-whisper` with `base` model by default (CPU-friendly); model name
  configurable via env. First run downloads the model to local cache (free).
- Auto-detect language; if detected language ≠ English, use `task=translate`
  so v1 always yields English captions.
- Backend calls it via `child_process.spawn` with timeout; non-zero exit or
  invalid JSON → job fails with a clear error.

## Data Model

```ts
Job {
  id: string            // nanoid, also the tmp dir name
  status: 'uploading' | 'extracting' | 'transcribing' | 'ready'
        | 'rendering' | 'done' | 'error'
  error?: string
  video: { filename, duration, width, height }
  tracks: CaptionTrack[]        // v1: exactly one, language 'en'
  createdAt: number             // for TTL sweeper
}

CaptionTrack {
  language: string              // 'en' in v1
  segments: { id, start, end, text }[]
}

CaptionStyle {
  preset?: string               // 'clean' | 'podcast' | 'bold-reels' | 'minimal' | 'karaoke'
  fontFamily: string            // from bundled list
  fontSizePct: number           // relative to video height → scales across resolutions
  textColor: string             // hex
  background: { enabled: boolean, color: string, opacity: number, rounded: boolean }
  outline: { enabled: boolean, color: string }
  position: 'top' | 'middle' | 'bottom'
  verticalOffsetPct: number
}
```

Jobs live in an in-memory Map (MVP; no DB). Restarting the server loses jobs —
acceptable since files are ephemeral anyway.

Multi-language future: `tracks[]` is already a list; rendering iterates tracks
and assigns each its own ASS style/position. Adding Urdu+English dual captions
= add a track + a style, no rewrite. Translation = optional `translate:
targetLang` on export, backed later by LibreTranslate (free, self-hosted).

## API Endpoints (NestJS, prefix /api)

| Method | Path | Purpose |
|---|---|---|
| POST | /api/upload | multipart video → creates job, kicks off extract+transcribe async; returns `{ jobId }` |
| GET | /api/jobs/:id | job status + transcript when ready (frontend polls ~1 s) |
| PATCH | /api/jobs/:id/transcript | save edited segments |
| POST | /api/jobs/:id/export | body: `{ style }` → generates ASS, burns video async |
| GET | /api/jobs/:id/download | streams output.mp4; schedules cleanup after send |
| GET | /api/jobs/:id/video | streams the original upload for the preview player |

## Styling & Rendering

- **Format: `.ass` (Advanced SubStation Alpha)** — supports fonts, colors,
  background boxes (BorderStyle=4 / BorderStyle=3), outlines, margins/alignment.
  Burned with FFmpeg's `ass` filter. No extra dependencies.
- **Fonts:** 5–6 open fonts (e.g. Montserrat, Roboto, Oswald, Lora, Bangers)
  bundled in the repo; passed to FFmpeg via `fontsdir` so export matches preview
  (same font files served to the browser via `@font-face`).
- **Preview parity:** overlay CSS and ASS generation derive from the same
  `CaptionStyle` object with shared math (font size as % of video height,
  position as alignment + margin). Rounded background: CSS `border-radius` in
  preview; in ASS, BorderStyle=4 box (visually close; documented as v1
  approximation).
- **Presets:** 5 ready-made `CaptionStyle` values, one-click, still tweakable.

## Frontend (Next.js + Tailwind, dark modern dashboard)

Single-page flow with three states:

1. **Upload** — drag-and-drop zone; client-side type/size validation; upload
   progress bar.
2. **Processing** — stepper (Uploading → Extracting audio → Transcribing) driven
   by polling `GET /api/jobs/:id`.
3. **Studio** — two-pane:
   - Left: preset gallery + style controls (font select, size slider, color
     pickers, background toggle+opacity, outline toggle, position control).
   - Right: video player (original file) with caption overlay synced via
     `timeupdate`; below it an editable transcript list (click segment → seek;
     edit text inline).
   - Export button → progress → Download button. "Start over" resets.

## Error Handling

- Upload: reject wrong MIME/extension and oversized files (default 500 MB,
  env-configurable) with clear messages.
- FFmpeg/Whisper failures: job → `error` with a human-readable message
  (e.g. "No audio track found"); stderr logged server-side. Frontend shows the
  error with a retry/start-over option.
- Videos with no speech: empty transcript → UI explains and still allows export
  (no captions) or start over.
- Timeouts: transcription and render have per-job timeouts scaled by duration.
- Sanitization: uploaded filenames never used in paths — jobs use generated IDs;
  files stored as `input.<safe-ext>`.
- Rate limiting: simple per-IP limiter on upload (NestJS throttler).

## Cleanup

- After download response completes → delete `tmp/<jobId>/`.
- Sweeper interval: delete job dirs older than TTL (default 1 h) — covers
  abandoned jobs and never-downloaded exports.

## Testing

- **Backend unit tests:** ASS generator (style → ASS text, the core logic),
  transcript merge/edit, cleanup scheduling.
- **Backend integration:** upload → transcribe (tiny fixture video with known
  speech) → export → download, asserting output exists and job dir is cleaned.
  Whisper mocked in CI-fast mode; one opt-in real-model test locally.
- **Frontend:** component tests for style controls → overlay style mapping;
  manual E2E pass for the full flow (MVP).

## Deployment (later, not v1 scope)

Docker Compose (frontend, backend+ffmpeg+python in one image), Nginx reverse
proxy on a VPS. v1 target is local dev: `npm run dev` in frontend + backend,
`pip install -r transcriber/requirements.txt`.

## GitHub

- Single repo `video-caption` (monorepo) on `github.com/umairnawaz333`.
- Root README (setup: Node 20+, Python 3.10+, FFmpeg via Homebrew), MIT license,
  `.gitignore` for node_modules, tmp/, model cache, `.env`.
- Push via the user's existing token/credentials.

## Success Criteria

- Upload a video → accurate English captions (including translated-to-English
  for non-English speech)
- Style captions with presets/controls; preview matches exported result
- Download burned MP4
- No files persist after download/TTL
- Zero paid API calls anywhere in the pipeline
