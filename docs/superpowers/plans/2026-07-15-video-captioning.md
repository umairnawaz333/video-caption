# AI Video Captioning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app: upload a video → local Whisper generates English captions → user styles them with live preview → FFmpeg burns them in → download; temp files auto-deleted.

**Architecture:** Monorepo. Next.js frontend (dashboard, style controls, DOM-overlay preview) → NestJS backend (jobs in an in-memory Map, upload via Multer, FFmpeg for audio-extract/burn, Python faster-whisper sidecar for transcription). Captions rendered to `.ass` and burned with FFmpeg's `ass` filter; the same `CaptionStyle` object drives both the CSS overlay and the ASS generator.

**Tech Stack:** Next.js 15 + React + Tailwind, NestJS 11 + Multer, FFmpeg/ffprobe, Python 3.10+ with `faster-whisper`, Jest + supertest (backend), Vitest (frontend lib).

## Global Constraints

- **Zero paid API calls.** Everything runs locally (faster-whisper, FFmpeg). No API keys anywhere.
- English captions in v1; non-English speech handled by Whisper `task=translate` (outputs English).
- Data model uses `tracks: CaptionTrack[]` (a list) even though v1 has exactly one track — do not flatten it.
- Node 20+, Python 3.10+, FFmpeg installed via Homebrew.
- Backend port **4000**, global prefix **`/api`**, CORS allows `http://localhost:3000`. Frontend port 3000.
- Upload limit 500 MB (env `MAX_UPLOAD_MB`), allowed types MP4/MOV/AVI. Job TTL 1 hour (env `JOB_TTL_MS`).
- Temp files live in `tmp/<jobId>/` at the repo root; deleted after download and by a TTL sweeper.
- **Commit messages: plain, no attribution footers, never mention Claude/AI.**
- Repo will be pushed to `github.com/umairnawaz333/video-caption` (public, monorepo).

## File Structure

```
backend/src/
  main.ts, app.module.ts, config.ts
  jobs/types.ts            # Job, Segment, CaptionTrack, CaptionStyle, VideoMeta
  jobs/jobs.service.ts     # in-memory Map store + tmp dir lifecycle
  jobs/jobs.controller.ts  # GET job, PATCH transcript, GET video stream
  jobs/jobs.module.ts
  processing/ffmpeg.service.ts        # probe, extractAudio, burnSubtitles
  processing/transcription.service.ts # spawns python sidecar
  processing/pipeline.service.ts      # extract → transcribe → ready
  processing/processing.module.ts
  upload/upload.controller.ts, upload/upload.module.ts
  rendering/ass.ts                    # pure ASS generation (most-tested unit)
  rendering/rendering.service.ts      # export flow: ass → burn → done
  rendering/rendering.controller.ts   # POST export, GET download (+cleanup)
  rendering/rendering.module.ts
  cleanup/cleanup.service.ts          # TTL sweeper (setInterval)
frontend/
  app/page.tsx, app/layout.tsx, app/globals.css
  lib/types.ts, lib/presets.ts, lib/captionStyle.ts, lib/api.ts
  components/UploadZone.tsx, ProcessingView.tsx, Studio.tsx,
  CaptionOverlay.tsx, StyleControls.tsx, TranscriptEditor.tsx, ExportBar.tsx
transcriber/transcribe.py, transcriber/requirements.txt
fonts/Anton-Regular.ttf, fonts/Bangers-Regular.ttf   # OFL-licensed, committed
tmp/            # gitignored
```

Caption fonts: **Arial, Georgia, Impact** (macOS system fonts — libass finds them), **Anton, Bangers** (downloaded static OFL TTFs in `fonts/`, passed to FFmpeg via `fontsdir`, loaded in the browser via Google Fonts CSS `<link>`).

---

### Task 1: Monorepo scaffolding

**Files:**
- Create: `backend/` (NestJS CLI), `frontend/` (create-next-app), `transcriber/`, `tmp/.gitkeep`, root `.gitignore`

**Interfaces:**
- Produces: working `npm run start:dev` (backend, port 4000 configured later) and `npm run dev` (frontend); repo layout all later tasks assume.

- [ ] **Step 1: Scaffold backend and frontend**

```bash
cd /Users/umairnawaz/Projects/Video-caption
npx -y @nestjs/cli@latest new backend --package-manager npm --skip-git
npx -y create-next-app@latest frontend --ts --tailwind --eslint --app --no-src-dir --use-npm --import-alias "@/*"
mkdir -p transcriber fonts tmp && touch tmp/.gitkeep
```

- [ ] **Step 2: Root .gitignore**

Replace root `.gitignore` with:

```gitignore
.DS_Store
node_modules/
tmp/*
!tmp/.gitkeep
.env
__pycache__/
*.pyc
transcriber/.venv/
.next/
dist/
coverage/
```

- [ ] **Step 3: Backend deps + strip boilerplate**

```bash
cd backend && npm i @nestjs/throttler && npm i -D @types/multer
rm src/app.controller.ts src/app.controller.spec.ts src/app.service.ts
```

Replace `backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

Replace `backend/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: 'http://localhost:3000' });
  await app.listen(4000);
}
bootstrap();
```

Create `backend/src/config.ts`. Don't derive the repo root from `__dirname` — its depth differs between ts-jest (`src/`) and compiled output (`dist/src/`). Walk up from `cwd` instead:

```ts
import * as fs from 'fs';
import * as path from 'path';

// Walk up from cwd (normally backend/) to the repo root (contains transcriber/)
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'transcriber'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), '..');
}
const repoRoot = findRepoRoot();

export const config = {
  tmpRoot: process.env.TMP_ROOT ?? path.join(repoRoot, 'tmp'),
  fontsDir: process.env.FONTS_DIR ?? path.join(repoRoot, 'fonts'),
  pythonBin: process.env.PYTHON_BIN ?? 'python3',
  transcriberScript:
    process.env.TRANSCRIBER_SCRIPT ?? path.join(repoRoot, 'transcriber', 'transcribe.py'),
  whisperModel: process.env.WHISPER_MODEL ?? 'base',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 500),
  jobTtlMs: Number(process.env.JOB_TTL_MS ?? 3_600_000),
};
```

- [ ] **Step 4: Verify both apps boot**

```bash
cd backend && npm run build          # Expected: compiles clean
cd ../frontend && npm run build      # Expected: compiles clean
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Scaffold monorepo: NestJS backend, Next.js frontend, transcriber dir"
```

---

### Task 2: Fonts + FFmpeg prerequisite check

**Files:**
- Create: `fonts/Anton-Regular.ttf`, `fonts/Bangers-Regular.ttf`, `fonts/LICENSE-OFL.txt`

**Interfaces:**
- Produces: `fonts/` dir consumed by FFmpeg `fontsdir` (Task 9) and font names `Anton`, `Bangers` used in presets (Task 10).

- [ ] **Step 1: Verify FFmpeg is installed**

```bash
ffmpeg -version && ffprobe -version
```

Expected: version output. If missing: `brew install ffmpeg`.

- [ ] **Step 2: Download OFL fonts (one-time, free)**

```bash
cd /Users/umairnawaz/Projects/Video-caption/fonts
curl -fsSL -o Anton-Regular.ttf   "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf"
curl -fsSL -o Bangers-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/bangers/Bangers-Regular.ttf"
curl -fsSL -o LICENSE-OFL.txt     "https://github.com/google/fonts/raw/main/ofl/anton/OFL.txt"
file Anton-Regular.ttf Bangers-Regular.ttf   # Expected: "TrueType Font data" for both
```

- [ ] **Step 3: Commit**

```bash
git add fonts && git commit -m "Add OFL caption fonts (Anton, Bangers)"
```

---

### Task 3: Whisper transcriber sidecar

**Files:**
- Create: `transcriber/transcribe.py`, `transcriber/requirements.txt`, `transcriber/README.md`

**Interfaces:**
- Produces: CLI `python3 transcribe.py --audio <wav> [--model base]` → prints to stdout exactly `{"language": "<iso>", "segments": [{"start": float, "end": float, "text": str}]}`. Non-zero exit + stderr message on failure. Consumed by `TranscriptionService` (Task 7).

- [ ] **Step 1: Write the script**

`transcriber/transcribe.py`:

```python
#!/usr/bin/env python3
"""Transcribe audio to English segments using faster-whisper (local, free).

Prints JSON to stdout: {"language": str, "segments": [{"start","end","text"}]}
Non-English audio is re-run with task=translate so output text is English.
"""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="base")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper not installed; run: pip install -r requirements.txt", file=sys.stderr)
        return 2

    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    segments, info = model.transcribe(args.audio, task="transcribe", vad_filter=True)
    segs = list(segments)  # generator -> list (runs the model)

    if info.language != "en":
        segments, info = model.transcribe(args.audio, task="translate", vad_filter=True)
        segs = list(segments)

    json.dump(
        {
            "language": info.language,
            "segments": [
                {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
                for s in segs
                if s.text.strip()
            ],
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`transcriber/requirements.txt`:

```
faster-whisper>=1.0.0
```

`transcriber/README.md`:

```markdown
# Transcriber sidecar

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python transcribe.py --audio path/to/audio.wav

First run downloads the Whisper `base` model (~150 MB) to the local HF cache. Free, offline after that.
```

- [ ] **Step 2: Install and verify with real speech (macOS `say`)**

```bash
cd /Users/umairnawaz/Projects/Video-caption/transcriber
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
say -o /tmp/vc-test.aiff "Hello world. This is a caption test."
ffmpeg -y -i /tmp/vc-test.aiff -ac 1 -ar 16000 /tmp/vc-test.wav
.venv/bin/python transcribe.py --audio /tmp/vc-test.wav | python3 -m json.tool
```

Expected: JSON with `"language": "en"` and a segment whose text contains "caption test".

- [ ] **Step 3: Commit**

```bash
git add transcriber && git commit -m "Add faster-whisper transcriber sidecar"
```

---

### Task 4: Job types + JobsService (TDD)

**Files:**
- Create: `backend/src/jobs/types.ts`, `backend/src/jobs/jobs.service.ts`, `backend/src/jobs/jobs.module.ts`
- Test: `backend/src/jobs/jobs.service.spec.ts`

**Interfaces:**
- Produces:
  - Types `JobStatus`, `Segment {id,start,end,text}`, `CaptionTrack {language,segments}`, `VideoMeta {filename,duration,width,height}`, `CaptionStyle` (exact shape below), `Job {id,status,error?,video?,tracks,createdAt,dir}`.
  - `JobsService.create(): Job` (generates id via `crypto.randomUUID()`, mkdirs `config.tmpRoot/<id>`), `.get(id): Job | undefined`, `.update(id, patch: Partial<Job>): Job`, `.remove(id): void` (deletes dir recursively + map entry), `.all(): Job[]`, `.toPublic(job)` (strips `dir`).

- [ ] **Step 1: Write types**

`backend/src/jobs/types.ts`:

```ts
export type JobStatus =
  | 'uploading' | 'extracting' | 'transcribing' | 'ready'
  | 'rendering' | 'done' | 'error';

export interface Segment { id: string; start: number; end: number; text: string }
export interface CaptionTrack { language: string; segments: Segment[] }
export interface VideoMeta { filename: string; duration: number; width: number; height: number }

export interface CaptionStyle {
  preset?: string;
  fontFamily: string;
  fontSizePct: number;          // % of video height
  textColor: string;            // '#RRGGBB'
  background: { enabled: boolean; color: string; opacity: number; rounded: boolean };
  outline: { enabled: boolean; color: string };
  position: 'top' | 'middle' | 'bottom';
  verticalOffsetPct: number;    // % of video height from the edge
}

export interface Job {
  id: string;
  status: JobStatus;
  error?: string;
  video?: VideoMeta;
  tracks: CaptionTrack[];       // v1: exactly one, language 'en'
  createdAt: number;
  dir: string;                  // tmp/<id> — never sent to the client
}
```

- [ ] **Step 2: Write the failing test**

`backend/src/jobs/jobs.service.spec.ts`:

```ts
import * as fs from 'fs';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  beforeEach(() => { service = new JobsService(); });
  afterEach(() => { service.all().forEach((j) => service.remove(j.id)); });

  it('creates a job with a tmp dir and empty tracks', () => {
    const job = service.create();
    expect(job.status).toBe('uploading');
    expect(job.tracks).toEqual([]);
    expect(fs.existsSync(job.dir)).toBe(true);
    expect(service.get(job.id)).toBe(job);
  });

  it('updates a job', () => {
    const job = service.create();
    service.update(job.id, { status: 'ready' });
    expect(service.get(job.id)!.status).toBe('ready');
  });

  it('remove deletes dir and entry', () => {
    const job = service.create();
    service.remove(job.id);
    expect(service.get(job.id)).toBeUndefined();
    expect(fs.existsSync(job.dir)).toBe(false);
  });

  it('toPublic strips dir', () => {
    const job = service.create();
    expect((service.toPublic(job) as any).dir).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest src/jobs --verbose`
Expected: FAIL — cannot find module `./jobs.service`.

- [ ] **Step 4: Implement**

`backend/src/jobs/jobs.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { Job } from './types';

@Injectable()
export class JobsService {
  private jobs = new Map<string, Job>();

  create(): Job {
    const id = randomUUID();
    const dir = path.join(config.tmpRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    const job: Job = { id, status: 'uploading', tracks: [], createdAt: Date.now(), dir };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Job>): Job {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`job ${id} not found`);
    Object.assign(job, patch);
    return job;
  }

  remove(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    fs.rmSync(job.dir, { recursive: true, force: true });
    this.jobs.delete(id);
  }

  all(): Job[] {
    return [...this.jobs.values()];
  }

  toPublic(job: Job): Omit<Job, 'dir'> {
    const { dir: _dir, ...pub } = job;
    return pub;
  }
}
```

`backend/src/jobs/jobs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
```

Add `JobsModule` to `AppModule` imports.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/jobs --verbose`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/src && git commit -m "Add job model and in-memory job store"
```

---

### Task 5: ASS subtitle generator (TDD — core logic)

**Files:**
- Create: `backend/src/rendering/ass.ts`
- Test: `backend/src/rendering/ass.spec.ts`

**Interfaces:**
- Consumes: `Segment`, `CaptionStyle` from `jobs/types`.
- Produces: `generateAss(segments: Segment[], style: CaptionStyle, video: {width:number; height:number}): string`; helpers `hexToAssColor(hex: string, transparency?: number): string`, `formatAssTime(sec: number): string`, `escapeAssText(text: string): string`. Consumed by `RenderingService` (Task 9).

ASS notes baked into the implementation: colors are `&HAABBGGRR` (alpha `00`=opaque, `FF`=transparent); alignment numpad (bottom-center 2, middle-center 5, top-center 8); `BorderStyle=3` draws an opaque box using OutlineColour (rounded corners are a documented v1 approximation — box is square in export, rounded in preview); `BorderStyle=1` is outline text.

- [ ] **Step 1: Write the failing tests**

`backend/src/rendering/ass.spec.ts`:

```ts
import { generateAss, hexToAssColor, formatAssTime, escapeAssText } from './ass';
import { CaptionStyle, Segment } from '../jobs/types';

const baseStyle: CaptionStyle = {
  fontFamily: 'Arial',
  fontSizePct: 5,
  textColor: '#FFFFFF',
  background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
  outline: { enabled: false, color: '#000000' },
  position: 'bottom',
  verticalOffsetPct: 5,
};
const segments: Segment[] = [
  { id: '1', start: 0, end: 1.5, text: 'Hello world' },
  { id: '2', start: 61.25, end: 62, text: 'Line {two}\nhere' },
];
const video = { width: 1920, height: 1080 };

describe('hexToAssColor', () => {
  it('converts RGB to &HAABBGGRR', () => {
    expect(hexToAssColor('#FF8800')).toBe('&H000088FF');
    expect(hexToAssColor('#000000', 0.4)).toBe('&H66000000');
  });
});

describe('formatAssTime', () => {
  it('formats h:mm:ss.cc', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
    expect(formatAssTime(61.25)).toBe('0:01:01.25');
    expect(formatAssTime(3599.999)).toBe('1:00:00.00');
  });
});

describe('escapeAssText', () => {
  it('strips braces and converts newlines', () => {
    expect(escapeAssText('a {b}\nc')).toBe('a b\\Nc');
  });
});

describe('generateAss', () => {
  it('emits resolution, style and dialogue lines', () => {
    const ass = generateAss(segments, baseStyle, video);
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');
    // 5% of 1080 = 54px font; background → BorderStyle 3; bottom → alignment 2; offset 5% of 1080 = 54
    expect(ass).toMatch(/Style: Caption,Arial,54,&H00FFFFFF,.*,3,\d+,0,2,60,60,54,1/);
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.50,Caption,,0,0,0,,Hello world');
    expect(ass).toContain('Line two\\Nhere');
  });

  it('uses outline style when background disabled', () => {
    const style: CaptionStyle = {
      ...baseStyle,
      background: { ...baseStyle.background, enabled: false },
      outline: { enabled: true, color: '#112233' },
      position: 'middle',
    };
    const ass = generateAss(segments, style, video);
    expect(ass).toMatch(/,1,\d+,0,5,60,60,0,1/); // BorderStyle 1, align 5 (middle), marginV 0
    expect(ass).toContain('&H00332211'); // outline color BGR
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/rendering --verbose`
Expected: FAIL — cannot find module `./ass`.

- [ ] **Step 3: Implement**

`backend/src/rendering/ass.ts`:

```ts
import { CaptionStyle, Segment } from '../jobs/types';

/** '#RRGGBB' + transparency (0 = opaque, 1 = invisible) -> ASS '&HAABBGGRR' */
export function hexToAssColor(hex: string, transparency = 0): string {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  const a = Math.round(transparency * 255).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

export function formatAssTime(sec: number): string {
  const total = Math.round(sec * 100); // centiseconds, avoids float drift
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const h = Math.floor(total / 360000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(s)}.${p(cs)}`;
}

export function escapeAssText(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

const ALIGN: Record<CaptionStyle['position'], number> = { bottom: 2, middle: 5, top: 8 };

export function generateAss(
  segments: Segment[],
  style: CaptionStyle,
  video: { width: number; height: number },
): string {
  const fontSize = Math.round((style.fontSizePct / 100) * video.height);
  const bg = style.background;

  const borderStyle = bg.enabled ? 3 : 1;
  // BorderStyle=3 draws the box with OutlineColour; Outline acts as box padding.
  const outlineWidth = bg.enabled
    ? Math.max(2, Math.round(fontSize * 0.18))
    : style.outline.enabled
      ? Math.max(1, Math.round(fontSize * 0.07))
      : 0;
  const outlineColor = bg.enabled
    ? hexToAssColor(bg.color, 1 - bg.opacity)
    : hexToAssColor(style.outline.color);
  const primary = hexToAssColor(style.textColor);
  const marginV =
    style.position === 'middle'
      ? 0
      : Math.max(0, Math.round((style.verticalOffsetPct / 100) * video.height));

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${video.width}`,
    `PlayResY: ${video.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${style.fontFamily},${fontSize},${primary},${primary},${outlineColor},${outlineColor},0,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},0,${ALIGN[style.position]},60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = segments.map(
    (s) =>
      `Dialogue: 0,${formatAssTime(s.start)},${formatAssTime(s.end)},Caption,,0,0,0,,${escapeAssText(s.text)}`,
  );

  return [...header, ...events, ''].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/rendering --verbose`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rendering && git commit -m "Add ASS subtitle generator with style support"
```

---

### Task 6: FFmpeg service (integration-tested)

**Files:**
- Create: `backend/src/processing/ffmpeg.service.ts`, `backend/src/processing/processing.module.ts`
- Test: `backend/src/processing/ffmpeg.service.spec.ts`

**Interfaces:**
- Produces: `FfmpegService.probe(file): Promise<VideoMeta-less {duration,width,height}>`, `.extractAudio(input, outputWav): Promise<void>` (16 kHz mono PCM), `.burnSubtitles(input, assPath, fontsDir, output): Promise<void>`. Consumed by `PipelineService` (Task 8) and `RenderingService` (Task 9). Tests require ffmpeg installed (generate fixtures with `lavfi`).

- [ ] **Step 1: Write the failing test**

`backend/src/processing/ffmpeg.service.spec.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { FfmpegService } from './ffmpeg.service';

describe('FfmpegService (requires ffmpeg)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffsvc-'));
  const input = path.join(dir, 'in.mp4');
  const service = new FfmpegService();

  beforeAll(() => {
    // 2s black 320x240 video with a 440Hz tone
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=320x240:d=2 -f lavfi -i sine=frequency=440:duration=2 ` +
      `-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${input}"`,
      { stdio: 'ignore' },
    );
  }, 30_000);

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('probes dimensions and duration', async () => {
    const meta = await service.probe(input);
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(240);
    expect(meta.duration).toBeGreaterThan(1.5);
  });

  it('extracts 16kHz mono wav', async () => {
    const wav = path.join(dir, 'a.wav');
    await service.extractAudio(input, wav);
    expect(fs.existsSync(wav)).toBe(true);
    expect(fs.statSync(wav).size).toBeGreaterThan(10_000);
  });

  it('burns an ass file into the video', async () => {
    const ass = path.join(dir, 'c.ass');
    fs.writeFileSync(ass, [
      '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 320', 'PlayResY: 240', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Caption,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1',
      '', '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:00.00,0:00:02.00,Caption,,0,0,0,,Hello',
    ].join('\n'));
    const out = path.join(dir, 'out.mp4');
    await service.burnSubtitles(input, ass, path.resolve('..', 'fonts'), out);
    expect(fs.statSync(out).size).toBeGreaterThan(1000);
  }, 30_000);

  it('rejects with stderr tail on bad input', async () => {
    await expect(service.probe(path.join(dir, 'missing.mp4'))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/processing/ffmpeg --verbose`
Expected: FAIL — cannot find module `./ffmpeg.service`.

- [ ] **Step 3: Implement**

`backend/src/processing/ffmpeg.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';

/** Escape a path for use inside an ffmpeg filter argument. */
function filterEscape(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

@Injectable()
export class FfmpegService {
  private run(bin: string, args: string[], timeoutMs = 600_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, { timeout: timeoutMs });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.stderr.on('data', (d) => (err += d));
      proc.on('error', reject);
      proc.on('close', (code) =>
        code === 0
          ? resolve(out)
          : reject(new Error(`${bin} exited ${code}: ${err.slice(-500)}`)),
      );
    });
  }

  async probe(file: string): Promise<{ duration: number; width: number; height: number }> {
    const out = await this.run('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-show_entries', 'format=duration',
      '-of', 'json', file,
    ]);
    const data = JSON.parse(out);
    const stream = data.streams?.[0];
    if (!stream) throw new Error('No video stream found');
    return {
      duration: Number(data.format?.duration ?? 0),
      width: stream.width,
      height: stream.height,
    };
  }

  async extractAudio(input: string, outputWav: string): Promise<void> {
    await this.run('ffmpeg', [
      '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outputWav,
    ]);
  }

  async burnSubtitles(input: string, assPath: string, fontsDir: string, output: string): Promise<void> {
    const vf = `ass='${filterEscape(assPath)}':fontsdir='${filterEscape(fontsDir)}'`;
    await this.run('ffmpeg', [
      '-y', '-i', input, '-vf', vf, '-c:a', 'copy', output,
    ]);
  }
}
```

`backend/src/processing/processing.module.ts` (transcription + pipeline added in the next tasks):

```ts
import { Module } from '@nestjs/common';
import { FfmpegService } from './ffmpeg.service';

@Module({ providers: [FfmpegService], exports: [FfmpegService] })
export class ProcessingModule {}
```

Add `ProcessingModule` to `AppModule` imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/processing/ffmpeg --verbose`
Expected: 4 passed (may take ~20 s).

- [ ] **Step 5: Commit**

```bash
git add backend/src && git commit -m "Add FFmpeg service: probe, audio extraction, subtitle burn"
```

---

### Task 7: Transcription service (TDD with fake sidecar)

**Files:**
- Create: `backend/src/processing/transcription.service.ts`
- Modify: `backend/src/processing/processing.module.ts` (add provider/export)
- Test: `backend/src/processing/transcription.service.spec.ts`

**Interfaces:**
- Consumes: `config.pythonBin`, `config.transcriberScript`, `config.whisperModel`.
- Produces: `TranscriptionService.transcribe(audioPath: string): Promise<{ language: string; segments: { start: number; end: number; text: string }[] }>`. Rejects with the sidecar's stderr on failure. Consumed by `PipelineService` (Task 8).

- [ ] **Step 1: Write the failing test**

`backend/src/processing/transcription.service.spec.ts` — points `TRANSCRIBER_SCRIPT` at a fixture python script so no model download is needed:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TranscriptionService } from './transcription.service';

describe('TranscriptionService', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trsvc-'));

  function makeService(script: string): TranscriptionService {
    const svc = new TranscriptionService();
    (svc as any).script = script; // test seam; real value comes from config
    return svc;
  }

  it('parses sidecar JSON output', async () => {
    const fake = path.join(dir, 'ok.py');
    fs.writeFileSync(fake, `import json,sys
json.dump({"language":"en","segments":[{"start":0.0,"end":1.0,"text":"hi"}]}, sys.stdout)`);
    const result = await makeService(fake).transcribe('/any/audio.wav');
    expect(result.language).toBe('en');
    expect(result.segments).toEqual([{ start: 0, end: 1, text: 'hi' }]);
  });

  it('rejects with stderr on sidecar failure', async () => {
    const fake = path.join(dir, 'bad.py');
    fs.writeFileSync(fake, `import sys
print("model exploded", file=sys.stderr); sys.exit(3)`);
    await expect(makeService(fake).transcribe('/any/audio.wav')).rejects.toThrow(/model exploded/);
  });

  it('rejects on invalid JSON', async () => {
    const fake = path.join(dir, 'garbage.py');
    fs.writeFileSync(fake, `print("not json")`);
    await expect(makeService(fake).transcribe('/any/audio.wav')).rejects.toThrow(/invalid JSON/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/processing/transcription --verbose`
Expected: FAIL — cannot find module `./transcription.service`.

- [ ] **Step 3: Implement**

`backend/src/processing/transcription.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { config } from '../config';

export interface TranscriptResult {
  language: string;
  segments: { start: number; end: number; text: string }[];
}

@Injectable()
export class TranscriptionService {
  private script = config.transcriberScript;

  transcribe(audioPath: string): Promise<TranscriptResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        config.pythonBin,
        [this.script, '--audio', audioPath, '--model', config.whisperModel],
        { timeout: 1_800_000 }, // 30 min hard cap
      );
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.stderr.on('data', (d) => (err += d));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`transcriber exited ${code}: ${err.slice(-500)}`));
        try {
          resolve(JSON.parse(out) as TranscriptResult);
        } catch {
          reject(new Error(`transcriber returned invalid JSON: ${out.slice(0, 200)}`));
        }
      });
    });
  }
}
```

Add `TranscriptionService` to `ProcessingModule` providers + exports.

Note: the transcriber README uses a venv; for the backend to find faster-whisper, either `pip3 install faster-whisper` globally or set `PYTHON_BIN=<repo>/transcriber/.venv/bin/python`. Document this in the root README (Task 14) and use `PYTHON_BIN` in dev.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/processing/transcription --verbose`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src && git commit -m "Add transcription service wrapping the whisper sidecar"
```

---

### Task 8: Upload endpoint, pipeline, job endpoints (e2e with stubs)

**Files:**
- Create: `backend/src/processing/pipeline.service.ts`, `backend/src/upload/upload.controller.ts`, `backend/src/upload/upload.module.ts`, `backend/src/jobs/jobs.controller.ts`
- Modify: `backend/src/processing/processing.module.ts`, `backend/src/jobs/jobs.module.ts`, `backend/src/app.module.ts`
- Test: `backend/test/app.e2e-spec.ts` (replace scaffold file)

**Interfaces:**
- Consumes: `JobsService`, `FfmpegService`, `TranscriptionService`.
- Produces:
  - `PipelineService.process(jobId: string, inputPath: string): Promise<void>` — runs extract→transcribe, sets `tracks[0] = { language: 'en', segments }` (each segment gets `id: randomUUID()`), status transitions `extracting → transcribing → ready`, or `error` with message.
  - HTTP: `POST /api/upload` (field `file`) → `{ jobId }`; `GET /api/jobs/:id` → public job; `PATCH /api/jobs/:id/transcript` body `{ segments: Segment[] }`; `GET /api/jobs/:id/video` → streams original upload (Range-capable).

- [ ] **Step 1: Write PipelineService**

`backend/src/processing/pipeline.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { FfmpegService } from './ffmpeg.service';
import { TranscriptionService } from './transcription.service';

@Injectable()
export class PipelineService {
  private logger = new Logger(PipelineService.name);

  constructor(
    private jobs: JobsService,
    private ffmpeg: FfmpegService,
    private transcription: TranscriptionService,
  ) {}

  async process(jobId: string, inputPath: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    try {
      this.jobs.update(jobId, { status: 'extracting' });
      const meta = await this.ffmpeg.probe(inputPath);
      this.jobs.update(jobId, {
        video: { filename: path.basename(inputPath), ...meta },
      });

      const wav = path.join(job.dir, 'audio.wav');
      await this.ffmpeg.extractAudio(inputPath, wav);

      this.jobs.update(jobId, { status: 'transcribing' });
      const result = await this.transcription.transcribe(wav);

      this.jobs.update(jobId, {
        status: 'ready',
        tracks: [{
          language: 'en',
          segments: result.segments.map((s) => ({ id: randomUUID(), ...s })),
        }],
      });
    } catch (e) {
      this.logger.error(`job ${jobId} failed`, e as Error);
      this.jobs.update(jobId, { status: 'error', error: (e as Error).message });
    }
  }
}
```

Add `PipelineService` to `ProcessingModule` providers/exports; `ProcessingModule` must import `JobsModule`.

- [ ] **Step 2: Write UploadController**

`backend/src/upload/upload.controller.ts`:

```ts
import {
  BadRequestException, Controller, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { JobsService } from '../jobs/jobs.service';
import { PipelineService } from '../processing/pipeline.service';

const ALLOWED_EXT = ['.mp4', '.mov', '.avi'];
const ALLOWED_MIME = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'];

@Controller('upload')
export class UploadController {
  constructor(private jobs: JobsService, private pipeline: PipelineService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: config.tmpRoot,
        filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
      }),
      limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.mimetype)) {
          return cb(new BadRequestException('Only MP4, MOV or AVI videos are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No video file provided');
    const job = this.jobs.create();
    const ext = path.extname(file.originalname).toLowerCase();
    const inputPath = path.join(job.dir, `input${ext}`);
    fs.renameSync(file.path, inputPath);
    void this.pipeline.process(job.id, inputPath); // async, not awaited
    return { jobId: job.id };
  }
}
```

`backend/src/upload/upload.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProcessingModule } from '../processing/processing.module';
import { UploadController } from './upload.controller';

@Module({ imports: [JobsModule, ProcessingModule], controllers: [UploadController] })
export class UploadModule {}
```

- [ ] **Step 3: Write JobsController**

`backend/src/jobs/jobs.controller.ts`:

```ts
import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, Patch, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from './jobs.service';
import { Segment } from './types';

@Controller('jobs')
export class JobsController {
  constructor(private jobs: JobsService) {}

  private find(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.jobs.toPublic(this.find(id));
  }

  @Patch(':id/transcript')
  patchTranscript(@Param('id') id: string, @Body() body: { segments: Segment[] }) {
    const job = this.find(id);
    if (!Array.isArray(body?.segments)) throw new BadRequestException('segments must be an array');
    for (const s of body.segments) {
      if (
        typeof s.id !== 'string' || typeof s.text !== 'string' ||
        typeof s.start !== 'number' || typeof s.end !== 'number' || s.start >= s.end
      ) {
        throw new BadRequestException('invalid segment');
      }
    }
    if (!job.tracks[0]) throw new BadRequestException('transcript not ready');
    job.tracks[0].segments = body.segments;
    return this.jobs.toPublic(job);
  }

  @Get(':id/video')
  getVideo(@Param('id') id: string, @Res() res: Response) {
    const job = this.find(id);
    const input = fs.readdirSync(job.dir).find((f) => f.startsWith('input'));
    if (!input) throw new NotFoundException('Video file not found');
    res.sendFile(path.join(job.dir, input)); // express handles Range requests
  }
}
```

Add `JobsController` to `JobsModule` controllers. Add `UploadModule` to `AppModule` imports.

- [ ] **Step 4: Write the e2e test (stubbed ffmpeg/whisper)**

Replace `backend/test/app.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import { AppModule } from '../src/app.module';
import { FfmpegService } from '../src/processing/ffmpeg.service';
import { TranscriptionService } from '../src/processing/transcription.service';
import { JobsService } from '../src/jobs/jobs.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('upload → transcribe flow (e2e, stubbed processors)', () => {
  let app: INestApplication;
  let jobs: JobsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FfmpegService)
      .useValue({
        probe: async () => ({ duration: 2, width: 640, height: 360 }),
        extractAudio: async (_i: string, out: string) => fs.writeFileSync(out, 'wav'),
        burnSubtitles: async (_i: string, _a: string, _f: string, out: string) =>
          fs.writeFileSync(out, 'mp4'),
      })
      .overrideProvider(TranscriptionService)
      .useValue({
        transcribe: async () => ({
          language: 'en',
          segments: [{ start: 0, end: 1, text: 'hello world' }],
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    jobs = moduleRef.get(JobsService);
  });

  afterAll(async () => {
    jobs.all().forEach((j) => jobs.remove(j.id));
    await app.close();
  });

  it('rejects non-video uploads', async () => {
    await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('nope'), { filename: 'evil.exe', contentType: 'application/octet-stream' })
      .expect(400);
  });

  it('uploads, processes, edits transcript', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake-video-bytes'), { filename: 'clip.mp4', contentType: 'video/mp4' })
      .expect(201);
    const { jobId } = res.body;
    expect(jobId).toBeDefined();

    let job: any;
    for (let i = 0; i < 50; i++) {
      job = (await request(app.getHttpServer()).get(`/api/jobs/${jobId}`).expect(200)).body;
      if (job.status === 'ready' || job.status === 'error') break;
      await sleep(100);
    }
    expect(job.status).toBe('ready');
    expect(job.tracks[0].language).toBe('en');
    expect(job.tracks[0].segments[0].text).toBe('hello world');
    expect(job.dir).toBeUndefined();

    const seg = { ...job.tracks[0].segments[0], text: 'hello edited' };
    const patched = await request(app.getHttpServer())
      .patch(`/api/jobs/${jobId}/transcript`)
      .send({ segments: [seg] })
      .expect(200);
    expect(patched.body.tracks[0].segments[0].text).toBe('hello edited');
  });

  it('404s on unknown job', async () => {
    await request(app.getHttpServer()).get('/api/jobs/nope').expect(404);
  });
});
```

- [ ] **Step 5: Run e2e to verify it passes**

Run: `cd backend && npx jest --config test/jest-e2e.json --verbose`
Expected: 3 passed. (If it fails, debug — the stubs isolate HTTP + pipeline wiring.)

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && npx jest && npx jest --config test/jest-e2e.json`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend && git commit -m "Add upload endpoint, processing pipeline, and job endpoints"
```

---

### Task 9: Export, download, cleanup + TTL sweeper

**Files:**
- Create: `backend/src/rendering/rendering.service.ts`, `backend/src/rendering/rendering.controller.ts`, `backend/src/rendering/rendering.module.ts`, `backend/src/cleanup/cleanup.service.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/rendering/rendering.service.spec.ts`, extend `backend/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `generateAss` (Task 5), `FfmpegService.burnSubtitles` (Task 6), `JobsService`.
- Produces:
  - `RenderingService.export(jobId: string, style: CaptionStyle): Promise<void>` — validates job is `ready`/`done`, writes `captions.ass`, burns to `output.mp4`, status `rendering → done` (or `error`).
  - `validateStyle(style: unknown): CaptionStyle` — throws `BadRequestException` on malformed input.
  - HTTP: `POST /api/jobs/:id/export` body `{ style }` → `202 { ok: true }`; `GET /api/jobs/:id/download` → `output.mp4` attachment, then deletes the job.
  - `CleanupService` — `setInterval` every 10 min removes jobs older than `config.jobTtlMs`.

- [ ] **Step 1: Write the failing service test**

`backend/src/rendering/rendering.service.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { RenderingService, validateStyle } from './rendering.service';
import { CaptionStyle } from '../jobs/types';

const style: CaptionStyle = {
  fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
  background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
  outline: { enabled: false, color: '#000000' },
  position: 'bottom', verticalOffsetPct: 5,
};

describe('validateStyle', () => {
  it('accepts a valid style', () => {
    expect(validateStyle(style)).toEqual(style);
  });
  it('rejects bad values', () => {
    expect(() => validateStyle({ ...style, position: 'left' })).toThrow();
    expect(() => validateStyle({ ...style, fontSizePct: 90 })).toThrow();
    expect(() => validateStyle({ ...style, textColor: 'red' })).toThrow();
    expect(() => validateStyle(null)).toThrow();
  });
});

describe('RenderingService', () => {
  let jobs: JobsService;
  let ffmpeg: { burnSubtitles: jest.Mock };
  let service: RenderingService;

  beforeEach(() => {
    jobs = new JobsService();
    ffmpeg = {
      burnSubtitles: jest.fn(async (_i, _a, _f, out) => fs.writeFileSync(out, 'mp4')),
    };
    service = new RenderingService(jobs, ffmpeg as any);
  });
  afterEach(() => jobs.all().forEach((j) => jobs.remove(j.id)));

  function readyJob() {
    const job = jobs.create();
    fs.writeFileSync(path.join(job.dir, 'input.mp4'), 'x');
    jobs.update(job.id, {
      status: 'ready',
      video: { filename: 'input.mp4', duration: 2, width: 640, height: 360 },
      tracks: [{ language: 'en', segments: [{ id: '1', start: 0, end: 1, text: 'hi' }] }],
    });
    return job;
  }

  it('writes ass, burns, and marks done', async () => {
    const job = readyJob();
    await service.export(job.id, style);
    expect(jobs.get(job.id)!.status).toBe('done');
    const ass = fs.readFileSync(path.join(job.dir, 'captions.ass'), 'utf8');
    expect(ass).toContain('Dialogue:');
    expect(ffmpeg.burnSubtitles).toHaveBeenCalled();
  });

  it('sets error status when burn fails', async () => {
    const job = readyJob();
    ffmpeg.burnSubtitles.mockRejectedValueOnce(new Error('boom'));
    await service.export(job.id, style);
    expect(jobs.get(job.id)!.status).toBe('error');
    expect(jobs.get(job.id)!.error).toMatch(/boom/);
  });

  it('rejects export when transcript not ready', async () => {
    const job = jobs.create();
    await expect(service.export(job.id, style)).rejects.toThrow(/not ready/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/rendering/rendering.service --verbose`
Expected: FAIL — cannot find module `./rendering.service`.

- [ ] **Step 3: Implement service + controller + cleanup**

`backend/src/rendering/rendering.service.ts`:

```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { JobsService } from '../jobs/jobs.service';
import { FfmpegService } from '../processing/ffmpeg.service';
import { CaptionStyle } from '../jobs/types';
import { generateAss } from './ass';

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONTS = ['Arial', 'Georgia', 'Impact', 'Anton', 'Bangers'];

export function validateStyle(input: unknown): CaptionStyle {
  const s = input as CaptionStyle;
  const ok =
    s && typeof s === 'object' &&
    FONTS.includes(s.fontFamily) &&
    typeof s.fontSizePct === 'number' && s.fontSizePct >= 1 && s.fontSizePct <= 15 &&
    typeof s.textColor === 'string' && HEX.test(s.textColor) &&
    s.background && typeof s.background.enabled === 'boolean' &&
    HEX.test(s.background.color) &&
    s.background.opacity >= 0 && s.background.opacity <= 1 &&
    typeof s.background.rounded === 'boolean' &&
    s.outline && typeof s.outline.enabled === 'boolean' && HEX.test(s.outline.color) &&
    ['top', 'middle', 'bottom'].includes(s.position) &&
    typeof s.verticalOffsetPct === 'number' && s.verticalOffsetPct >= 0 && s.verticalOffsetPct <= 40;
  if (!ok) throw new BadRequestException('invalid caption style');
  return s;
}

@Injectable()
export class RenderingService {
  private logger = new Logger(RenderingService.name);

  constructor(private jobs: JobsService, private ffmpeg: FfmpegService) {}

  async export(jobId: string, style: CaptionStyle): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new BadRequestException('job not found');
    if (!['ready', 'done'].includes(job.status) || !job.video || !job.tracks[0]) {
      throw new BadRequestException('job is not ready for export');
    }
    const input = fs.readdirSync(job.dir).find((f) => f.startsWith('input'));
    if (!input) throw new BadRequestException('input video missing');

    this.jobs.update(jobId, { status: 'rendering' });
    try {
      const assPath = path.join(job.dir, 'captions.ass');
      fs.writeFileSync(
        assPath,
        generateAss(job.tracks[0].segments, style, {
          width: job.video.width,
          height: job.video.height,
        }),
      );
      await this.ffmpeg.burnSubtitles(
        path.join(job.dir, input), assPath, config.fontsDir, path.join(job.dir, 'output.mp4'),
      );
      this.jobs.update(jobId, { status: 'done' });
    } catch (e) {
      this.logger.error(`export ${jobId} failed`, e as Error);
      this.jobs.update(jobId, { status: 'error', error: (e as Error).message });
    }
  }
}
```

`backend/src/rendering/rendering.controller.ts`:

```ts
import {
  BadRequestException, Body, Controller, Get, HttpCode,
  NotFoundException, Param, Post, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { RenderingService, validateStyle } from './rendering.service';

@Controller('jobs')
export class RenderingController {
  constructor(private jobs: JobsService, private rendering: RenderingService) {}

  @Post(':id/export')
  @HttpCode(202)
  export(@Param('id') id: string, @Body() body: { style: unknown }) {
    const style = validateStyle(body?.style);
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found');
    if (!['ready', 'done'].includes(job.status)) {
      throw new BadRequestException('transcript is not ready yet');
    }
    void this.rendering.export(id, style); // async; client polls GET /jobs/:id
    return { ok: true };
  }

  @Get(':id/download')
  download(@Param('id') id: string, @Res() res: Response) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found');
    const file = path.join(job.dir, 'output.mp4');
    if (job.status !== 'done' || !fs.existsSync(file)) {
      throw new NotFoundException('Rendered video not available');
    }
    res.download(file, 'captioned.mp4', (err) => {
      if (!err) this.jobs.remove(id); // spec: delete temp files after download
    });
  }
}
```

`backend/src/rendering/rendering.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProcessingModule } from '../processing/processing.module';
import { RenderingController } from './rendering.controller';
import { RenderingService } from './rendering.service';

@Module({
  imports: [JobsModule, ProcessingModule],
  controllers: [RenderingController],
  providers: [RenderingService],
})
export class RenderingModule {}
```

`backend/src/cleanup/cleanup.service.ts`:

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(CleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private jobs: JobsService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sweep(), 600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  sweep(now = Date.now()) {
    for (const job of this.jobs.all()) {
      if (now - job.createdAt > config.jobTtlMs) {
        this.logger.log(`TTL sweep: removing job ${job.id}`);
        this.jobs.remove(job.id);
      }
    }
  }
}
```

Register: `RenderingModule` in `AppModule` imports; `CleanupService` as a provider in `JobsModule` (it only needs `JobsService`).

- [ ] **Step 4: Run service tests**

Run: `cd backend && npx jest src/rendering --verbose`
Expected: all pass.

- [ ] **Step 5: Extend the e2e test with export → download → cleanup**

Append to the `describe` block in `backend/test/app.e2e-spec.ts`:

```ts
  it('exports and downloads, then job is deleted', async () => {
    const up = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake'), { filename: 'c.mp4', contentType: 'video/mp4' })
      .expect(201);
    const id = up.body.jobId;
    for (let i = 0; i < 50; i++) {
      const { body } = await request(app.getHttpServer()).get(`/api/jobs/${id}`);
      if (body.status === 'ready') break;
      await sleep(100);
    }

    const style = {
      fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
      background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: false, color: '#000000' },
      position: 'bottom', verticalOffsetPct: 5,
    };
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/export`).send({ style }).expect(202);

    for (let i = 0; i < 50; i++) {
      const { body } = await request(app.getHttpServer()).get(`/api/jobs/${id}`);
      if (body.status === 'done') break;
      await sleep(100);
    }

    await request(app.getHttpServer()).get(`/api/jobs/${id}/download`).expect(200);
    await request(app.getHttpServer()).get(`/api/jobs/${id}`).expect(404); // cleaned up
  });

  it('rejects export with invalid style', async () => {
    const up = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake'), { filename: 'd.mp4', contentType: 'video/mp4' })
      .expect(201);
    await sleep(300);
    await request(app.getHttpServer())
      .post(`/api/jobs/${up.body.jobId}/export`)
      .send({ style: { fontFamily: 'Wingdings' } })
      .expect(400);
  });
```

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && npx jest && npx jest --config test/jest-e2e.json`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend && git commit -m "Add export, download with cleanup, and TTL sweeper"
```

---

### Task 10: Frontend lib — types, presets, style math, API client (TDD)

**Files:**
- Create: `frontend/lib/types.ts`, `frontend/lib/presets.ts`, `frontend/lib/captionStyle.ts`, `frontend/lib/api.ts`, `frontend/vitest.config.ts`
- Modify: `frontend/package.json` (test script)
- Test: `frontend/lib/captionStyle.test.ts`

**Interfaces:**
- Produces (consumed by all frontend components):
  - `lib/types.ts` — mirrors backend `Segment`, `CaptionTrack`, `VideoMeta`, `CaptionStyle`, `JobStatus`, plus `PublicJob { id, status, error?, video?, tracks, createdAt }`.
  - `lib/presets.ts` — `PRESETS: { id: string; name: string; style: CaptionStyle }[]` (5 presets), `FONTS: string[]`.
  - `lib/captionStyle.ts` — `styleToCss(style, containerHeight): React.CSSProperties`, `positionToCss(style): React.CSSProperties`, `findActiveSegment(segments, time): Segment | null`, `hexWithOpacity(hex, opacity): string`.
  - `lib/api.ts` — `uploadVideo(file, onProgress): Promise<{jobId: string}>` (XHR for progress), `getJob(id)`, `patchTranscript(id, segments)`, `exportJob(id, style)`, `videoUrl(id)`, `downloadUrl(id)`; base URL `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'`.

- [ ] **Step 1: Install vitest and add test script**

```bash
cd frontend && npm i -D vitest
```

`frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['lib/**/*.test.ts'] } });
```

Add to `frontend/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write types (mirror of backend)**

`frontend/lib/types.ts`:

```ts
export type JobStatus =
  | 'uploading' | 'extracting' | 'transcribing' | 'ready'
  | 'rendering' | 'done' | 'error';

export interface Segment { id: string; start: number; end: number; text: string }
export interface CaptionTrack { language: string; segments: Segment[] }
export interface VideoMeta { filename: string; duration: number; width: number; height: number }

export interface CaptionStyle {
  preset?: string;
  fontFamily: string;
  fontSizePct: number;
  textColor: string;
  background: { enabled: boolean; color: string; opacity: number; rounded: boolean };
  outline: { enabled: boolean; color: string };
  position: 'top' | 'middle' | 'bottom';
  verticalOffsetPct: number;
}

export interface PublicJob {
  id: string;
  status: JobStatus;
  error?: string;
  video?: VideoMeta;
  tracks: CaptionTrack[];
  createdAt: number;
}
```

- [ ] **Step 3: Write the failing tests**

`frontend/lib/captionStyle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findActiveSegment, hexWithOpacity, positionToCss, styleToCss } from './captionStyle';
import { PRESETS, FONTS } from './presets';
import type { CaptionStyle, Segment } from './types';

const style: CaptionStyle = {
  fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
  background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
  outline: { enabled: false, color: '#000000' },
  position: 'bottom', verticalOffsetPct: 5,
};

describe('hexWithOpacity', () => {
  it('converts to rgba', () => {
    expect(hexWithOpacity('#FF8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)');
  });
});

describe('styleToCss', () => {
  it('maps size, color, background, radius', () => {
    const css = styleToCss(style, 400); // 5% of 400 = 20px
    expect(css.fontSize).toBe(20);
    expect(css.color).toBe('#FFFFFF');
    expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0.6)');
    expect(css.borderRadius).toBeGreaterThan(0);
  });
  it('uses text-shadow outline when background off', () => {
    const s = { ...style, background: { ...style.background, enabled: false }, outline: { enabled: true, color: '#000000' } };
    const css = styleToCss(s, 400);
    expect(css.backgroundColor).toBe('transparent');
    expect(css.textShadow).toContain('#000000');
  });
});

describe('positionToCss', () => {
  it('anchors bottom with offset', () => {
    expect(positionToCss(style)).toMatchObject({ bottom: '5%' });
  });
  it('centers for middle', () => {
    expect(positionToCss({ ...style, position: 'middle' }).top).toBe('50%');
  });
});

describe('findActiveSegment', () => {
  const segs: Segment[] = [
    { id: 'a', start: 0, end: 1, text: 'one' },
    { id: 'b', start: 1.5, end: 3, text: 'two' },
  ];
  it('finds the active segment', () => {
    expect(findActiveSegment(segs, 0.5)?.id).toBe('a');
    expect(findActiveSegment(segs, 2)?.id).toBe('b');
  });
  it('returns null in gaps and past the end', () => {
    expect(findActiveSegment(segs, 1.2)).toBeNull();
    expect(findActiveSegment(segs, 99)).toBeNull();
  });
});

describe('presets', () => {
  it('has 5 presets, all fonts in FONTS list', () => {
    expect(PRESETS).toHaveLength(5);
    for (const p of PRESETS) {
      expect(FONTS).toContain(p.style.fontFamily);
      expect(p.style.fontSizePct).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./captionStyle` / `./presets`.

- [ ] **Step 5: Implement**

`frontend/lib/captionStyle.ts`:

```ts
import type { CSSProperties } from 'react';
import type { CaptionStyle, Segment } from './types';

export function hexWithOpacity(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function outlineShadow(color: string): string {
  return `-2px -2px 0 ${color}, 2px -2px 0 ${color}, -2px 2px 0 ${color}, 2px 2px 0 ${color}`;
}

/** Text styling for the caption bubble. containerHeight = rendered video height in px. */
export function styleToCss(style: CaptionStyle, containerHeight: number): CSSProperties {
  const fontSize = (style.fontSizePct / 100) * containerHeight;
  const bg = style.background;
  return {
    fontFamily: `'${style.fontFamily}', sans-serif`,
    fontSize,
    lineHeight: 1.25,
    color: style.textColor,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    padding: bg.enabled ? `${fontSize * 0.18}px ${fontSize * 0.45}px` : 0,
    borderRadius: bg.enabled && bg.rounded ? fontSize * 0.35 : 0,
    backgroundColor: bg.enabled ? hexWithOpacity(bg.color, bg.opacity) : 'transparent',
    textShadow: !bg.enabled && style.outline.enabled ? outlineShadow(style.outline.color) : 'none',
  };
}

/** Absolute positioning for the caption wrapper inside the video container. */
export function positionToCss(style: CaptionStyle): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute', left: 0, right: 0,
    display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    padding: '0 5%',
  };
  if (style.position === 'middle') return { ...base, top: '50%', transform: 'translateY(-50%)' };
  if (style.position === 'top') return { ...base, top: `${style.verticalOffsetPct}%` };
  return { ...base, bottom: `${style.verticalOffsetPct}%` };
}

export function findActiveSegment(segments: Segment[], time: number): Segment | null {
  return segments.find((s) => time >= s.start && time < s.end) ?? null;
}
```

`frontend/lib/presets.ts`:

```ts
import type { CaptionStyle } from './types';

export const FONTS = ['Arial', 'Georgia', 'Impact', 'Anton', 'Bangers'];

function make(partial: Partial<CaptionStyle> & { preset: string }): CaptionStyle {
  return {
    fontFamily: 'Arial', fontSizePct: 4.5, textColor: '#FFFFFF',
    background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
    outline: { enabled: false, color: '#000000' },
    position: 'bottom', verticalOffsetPct: 6,
    ...partial,
  };
}

export const PRESETS: { id: string; name: string; style: CaptionStyle }[] = [
  { id: 'clean', name: 'Clean', style: make({ preset: 'clean' }) },
  {
    id: 'podcast', name: 'Podcast',
    style: make({
      preset: 'podcast', fontFamily: 'Georgia', fontSizePct: 4,
      background: { enabled: true, color: '#1E293B', opacity: 0.75, rounded: true },
      verticalOffsetPct: 8,
    }),
  },
  {
    id: 'bold-reels', name: 'Bold Reels',
    style: make({
      preset: 'bold-reels', fontFamily: 'Anton', fontSizePct: 6.5,
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: true, color: '#000000' },
      verticalOffsetPct: 18,
    }),
  },
  {
    id: 'minimal', name: 'Minimal',
    style: make({
      preset: 'minimal', fontSizePct: 3.5,
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: false },
      outline: { enabled: true, color: '#000000' },
      verticalOffsetPct: 5,
    }),
  },
  {
    id: 'karaoke', name: 'Karaoke',
    style: make({
      preset: 'karaoke', fontFamily: 'Bangers', fontSizePct: 6, textColor: '#FFD700',
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: true, color: '#000000' },
      verticalOffsetPct: 12,
    }),
  },
];
```

`frontend/lib/api.ts`:

```ts
import type { CaptionStyle, PublicJob, Segment } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function uploadVideo(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ jobId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else {
        try { reject(new Error(JSON.parse(xhr.responseText).message ?? 'Upload failed')); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error — is the backend running on :4000?'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).message ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}

export const getJob = (id: string) =>
  fetch(`${BASE}/api/jobs/${id}`).then((r) => json<PublicJob>(r));

export const patchTranscript = (id: string, segments: Segment[]) =>
  fetch(`${BASE}/api/jobs/${id}/transcript`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments }),
  }).then((r) => json<PublicJob>(r));

export const exportJob = (id: string, style: CaptionStyle) =>
  fetch(`${BASE}/api/jobs/${id}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style }),
  }).then((r) => json<{ ok: boolean }>(r));

export const videoUrl = (id: string) => `${BASE}/api/jobs/${id}/video`;
export const downloadUrl = (id: string) => `${BASE}/api/jobs/${id}/download`;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend && git commit -m "Add frontend lib: types, presets, style math, API client"
```

---

### Task 11: Upload + processing UI

**Files:**
- Create: `frontend/components/UploadZone.tsx`, `frontend/components/ProcessingView.tsx`
- Modify: `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/app/globals.css`

**Interfaces:**
- Consumes: `uploadVideo`, `getJob` from `lib/api`; `PublicJob` from `lib/types`.
- Produces: `<UploadZone onUploaded(jobId: string) />`, `<ProcessingView job: PublicJob />`; `page.tsx` owns the app state machine: `{ phase: 'upload' } | { phase: 'processing', jobId } | { phase: 'studio', job } | { phase: 'done', jobId }` and polls `getJob` every 1 s while `phase === 'processing'` (stops on `ready` → studio, `error` → show error + retry). Studio/done components stubbed until Task 12–13.

- [ ] **Step 1: Layout, theme, fonts**

`frontend/app/layout.tsx` — dark theme + caption fonts via Google Fonts CSS (browser preview only; export uses local TTFs):

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Captionly — AI Video Captions',
  description: 'Free local AI captions burned into your video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: UploadZone**

`frontend/components/UploadZone.tsx`:

```tsx
'use client';
import { useRef, useState } from 'react';
import { uploadVideo } from '@/lib/api';

const ACCEPT = ['.mp4', '.mov', '.avi'];
const MAX_MB = 500;

export default function UploadZone({ onUploaded }: { onUploaded: (jobId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ACCEPT.includes(ext)) return setError('Please choose an MP4, MOV or AVI file.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`File is too large (max ${MAX_MB} MB).`);
    try {
      setProgress(0);
      const { jobId } = await uploadVideo(file, setProgress);
      onUploaded(jobId);
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition
          ${dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <div className="text-5xl">🎬</div>
        <p className="mt-4 text-lg font-medium">Drop your video here</p>
        <p className="mt-1 text-sm text-slate-400">or click to browse — MP4, MOV, AVI up to {MAX_MB} MB</p>
        <input
          ref={inputRef} type="file" accept={ACCEPT.join(',')} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
      </div>
      {progress !== null && (
        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-center text-sm text-slate-400">Uploading… {progress}%</p>
        </div>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: ProcessingView**

`frontend/components/ProcessingView.tsx`:

```tsx
'use client';
import type { PublicJob } from '@/lib/types';

const STEPS = [
  { key: 'extracting', label: 'Extracting audio' },
  { key: 'transcribing', label: 'Generating captions (local AI)' },
] as const;

export default function ProcessingView({ job }: { job: PublicJob | null }) {
  const activeIdx = STEPS.findIndex((s) => s.key === job?.status);
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mb-8 text-5xl animate-pulse">🎙️</div>
      <ul className="space-y-4 text-left">
        {STEPS.map((step, i) => {
          const stepDone = activeIdx > i || (activeIdx === -1 && job != null);
          const active = activeIdx === i;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm
                  ${stepDone ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-800 text-slate-500'}`}
              >
                {stepDone ? '✓' : i + 1}
              </span>
              <span className={active ? 'text-slate-100' : 'text-slate-400'}>{step.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-sm text-slate-500">
        Transcription runs locally with Whisper — longer videos take a few minutes.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Page state machine**

Replace `frontend/app/page.tsx`:

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import UploadZone from '@/components/UploadZone';
import ProcessingView from '@/components/ProcessingView';
import Studio from '@/components/Studio';
import { getJob } from '@/lib/api';
import type { PublicJob } from '@/lib/types';

type Phase =
  | { name: 'upload' }
  | { name: 'processing'; jobId: string; job: PublicJob | null }
  | { name: 'studio'; job: PublicJob }
  | { name: 'error'; message: string };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ name: 'upload' });

  useEffect(() => {
    if (phase.name !== 'processing') return;
    const timer = setInterval(async () => {
      try {
        const job = await getJob(phase.jobId);
        if (job.status === 'ready') setPhase({ name: 'studio', job });
        else if (job.status === 'error') setPhase({ name: 'error', message: job.error ?? 'Processing failed' });
        else setPhase({ name: 'processing', jobId: phase.jobId, job });
      } catch (e) {
        setPhase({ name: 'error', message: (e as Error).message });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase.name === 'processing' ? (phase as { jobId: string }).jobId : null]);

  const reset = useCallback(() => setPhase({ name: 'upload' }), []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Caption<span className="text-indigo-400">ly</span>
        </h1>
        <span className="text-xs text-slate-500">100% free · runs locally · files auto-deleted</span>
      </header>

      {phase.name === 'upload' && (
        <>
          <div className="mb-10 text-center">
            <h2 className="text-4xl font-bold">AI captions, burned in.</h2>
            <p className="mt-3 text-slate-400">Upload a video, style your captions, download the result.</p>
          </div>
          <UploadZone onUploaded={(jobId) => setPhase({ name: 'processing', jobId, job: null })} />
        </>
      )}
      {phase.name === 'processing' && <ProcessingView job={phase.job} />}
      {phase.name === 'studio' && <Studio job={phase.job} onReset={reset} />}
      {phase.name === 'error' && (
        <div className="mx-auto max-w-md text-center">
          <p className="rounded-lg bg-red-500/10 p-4 text-red-400">{phase.message}</p>
          <button onClick={reset} className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium hover:bg-indigo-500">
            Start over
          </button>
        </div>
      )}
    </main>
  );
}
```

Create a placeholder `frontend/components/Studio.tsx` so it compiles (replaced in Task 12):

```tsx
'use client';
import type { PublicJob } from '@/lib/types';

export default function Studio({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  return <div>Studio for job {job.id} <button onClick={onReset}>reset</button></div>;
}
```

- [ ] **Step 5: Verify build + manual smoke**

```bash
cd frontend && npm run build
```

Expected: clean build. Then run backend (`cd backend && npm run start:dev`) + frontend (`npm run dev`), open http://localhost:3000, upload the test video from Task 3 (`ffmpeg -f lavfi -i color=c=black:s=640x360:d=6 -i /tmp/vc-test.aiff -shortest -c:v libx264 -c:a aac /tmp/vc-test.mp4`), watch stepper reach the Studio placeholder.

- [ ] **Step 6: Commit**

```bash
git add frontend && git commit -m "Add upload flow and processing stepper UI"
```

---

### Task 12: Studio — preview player, caption overlay, style controls

**Files:**
- Create: `frontend/components/CaptionOverlay.tsx`, `frontend/components/StyleControls.tsx`
- Modify: `frontend/components/Studio.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `styleToCss`, `positionToCss`, `findActiveSegment` (lib), `videoUrl` (api), `PRESETS`, `FONTS`.
- Produces:
  - `<CaptionOverlay segments style currentTime containerHeight />` — renders active segment text, absolutely positioned.
  - `<StyleControls style onChange(style: CaptionStyle) />` — presets gallery + all controls.
  - `<Studio job onReset />` — owns `style: CaptionStyle` (init `PRESETS[0].style`), `segments: Segment[]` (init from `job.tracks[0].segments`), `currentTime`; passes `segments`/`setSegments` to `TranscriptEditor` and export state to `ExportBar` (Task 13 — stub inline for now).

- [ ] **Step 1: CaptionOverlay**

`frontend/components/CaptionOverlay.tsx`:

```tsx
'use client';
import { findActiveSegment, positionToCss, styleToCss } from '@/lib/captionStyle';
import type { CaptionStyle, Segment } from '@/lib/types';

export default function CaptionOverlay({
  segments, style, currentTime, containerHeight,
}: {
  segments: Segment[];
  style: CaptionStyle;
  currentTime: number;
  containerHeight: number;
}) {
  const active = findActiveSegment(segments, currentTime);
  if (!active || containerHeight === 0) return null;
  return (
    <div style={positionToCss(style)}>
      <span style={styleToCss(style, containerHeight)}>{active.text}</span>
    </div>
  );
}
```

- [ ] **Step 2: StyleControls**

`frontend/components/StyleControls.tsx`:

```tsx
'use client';
import { FONTS, PRESETS } from '@/lib/presets';
import type { CaptionStyle } from '@/lib/types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export default function StyleControls({
  style, onChange,
}: { style: CaptionStyle; onChange: (s: CaptionStyle) => void }) {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...style, ...patch, preset: undefined });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Presets</h3>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...p.style })}
              className={`rounded-lg border px-3 py-2 text-sm transition
                ${style.preset === p.id ? 'border-indigo-400 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 hover:border-slate-500'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Text</h3>
        <Row label="Font">
          <select
            value={style.fontFamily}
            onChange={(e) => set({ fontFamily: e.target.value })}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          >
            {FONTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Row>
        <Row label={`Size (${style.fontSizePct.toFixed(1)}%)`}>
          <input
            type="range" min={2} max={10} step={0.5} value={style.fontSizePct}
            onChange={(e) => set({ fontSizePct: Number(e.target.value) })}
            className="w-40 accent-indigo-500"
          />
        </Row>
        <Row label="Text color">
          <input
            type="color" value={style.textColor}
            onChange={(e) => set({ textColor: e.target.value.toUpperCase() })}
            className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900"
          />
        </Row>
        <Row label="Outline">
          <span className="flex items-center gap-2">
            <input
              type="checkbox" checked={style.outline.enabled}
              onChange={(e) => set({ outline: { ...style.outline, enabled: e.target.checked } })}
              className="accent-indigo-500"
            />
            <input
              type="color" value={style.outline.color} disabled={!style.outline.enabled}
              onChange={(e) => set({ outline: { ...style.outline, color: e.target.value.toUpperCase() } })}
              className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900 disabled:opacity-30"
            />
          </span>
        </Row>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Background</h3>
        <Row label="Show box">
          <input
            type="checkbox" checked={style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, enabled: e.target.checked } })}
            className="accent-indigo-500"
          />
        </Row>
        <Row label="Box color">
          <input
            type="color" value={style.background.color} disabled={!style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, color: e.target.value.toUpperCase() } })}
            className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900 disabled:opacity-30"
          />
        </Row>
        <Row label={`Opacity (${Math.round(style.background.opacity * 100)}%)`}>
          <input
            type="range" min={0.1} max={1} step={0.05} value={style.background.opacity}
            disabled={!style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, opacity: Number(e.target.value) } })}
            className="w-40 accent-indigo-500 disabled:opacity-30"
          />
        </Row>
        <Row label="Rounded corners">
          <input
            type="checkbox" checked={style.background.rounded} disabled={!style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, rounded: e.target.checked } })}
            className="accent-indigo-500 disabled:opacity-30"
          />
        </Row>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Position</h3>
        <Row label="Anchor">
          <div className="flex gap-1">
            {(['top', 'middle', 'bottom'] as const).map((p) => (
              <button
                key={p}
                onClick={() => set({ position: p })}
                className={`rounded-md px-3 py-1.5 text-sm capitalize
                  ${style.position === p ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </Row>
        <Row label={`Offset (${style.verticalOffsetPct}%)`}>
          <input
            type="range" min={0} max={40} step={1} value={style.verticalOffsetPct}
            disabled={style.position === 'middle'}
            onChange={(e) => set({ verticalOffsetPct: Number(e.target.value) })}
            className="w-40 accent-indigo-500 disabled:opacity-30"
          />
        </Row>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Studio (replace placeholder)**

`frontend/components/Studio.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import CaptionOverlay from './CaptionOverlay';
import StyleControls from './StyleControls';
import TranscriptEditor from './TranscriptEditor';
import ExportBar from './ExportBar';
import { videoUrl } from '@/lib/api';
import { PRESETS } from '@/lib/presets';
import type { CaptionStyle, PublicJob, Segment } from '@/lib/types';

export default function Studio({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CaptionStyle>({ ...PRESETS[0].style });
  const [segments, setSegments] = useState<Segment[]>(job.tracks[0]?.segments ?? []);
  const [currentTime, setCurrentTime] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF loop keeps captions in sync even between 'timeupdate' events
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <StyleControls style={style} onChange={setStyle} />
      </aside>

      <section className="space-y-6">
        <div ref={containerRef} className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} src={videoUrl(job.id)} controls className="w-full" />
          <CaptionOverlay
            segments={segments} style={style}
            currentTime={currentTime} containerHeight={containerHeight}
          />
        </div>

        <ExportBar jobId={job.id} style={style} segments={segments} onReset={onReset} />
        <TranscriptEditor segments={segments} onChange={setSegments} onSeek={seek} currentTime={currentTime} />
      </section>
    </div>
  );
}
```

Create compile-only stubs (implemented in Task 13):

`frontend/components/TranscriptEditor.tsx`:

```tsx
'use client';
import type { Segment } from '@/lib/types';

export default function TranscriptEditor(_props: {
  segments: Segment[]; onChange: (s: Segment[]) => void;
  onSeek: (t: number) => void; currentTime: number;
}) {
  return null;
}
```

`frontend/components/ExportBar.tsx`:

```tsx
'use client';
import type { CaptionStyle, Segment } from '@/lib/types';

export default function ExportBar(_props: {
  jobId: string; style: CaptionStyle; segments: Segment[]; onReset: () => void;
}) {
  return null;
}
```

- [ ] **Step 4: Verify build + manual check**

```bash
cd frontend && npm run build
```

Expected: clean. Manual: upload test video → studio shows player; captions appear over video at the right times; every control changes the overlay instantly; note the overlay caption is fully visible for each position/offset combination.

- [ ] **Step 5: Commit**

```bash
git add frontend && git commit -m "Add studio with live caption preview and style controls"
```

---

### Task 13: Transcript editor + export/download flow

**Files:**
- Modify: `frontend/components/TranscriptEditor.tsx`, `frontend/components/ExportBar.tsx` (replace stubs)

**Interfaces:**
- Consumes: `patchTranscript`, `exportJob`, `getJob`, `downloadUrl` from `lib/api`.
- Produces: full editor (inline text edit, click-to-seek, active-segment highlight) and export flow (save transcript → export → poll until `done`/`error` → download link → after download click, "start over" screen).

- [ ] **Step 1: TranscriptEditor (replace stub)**

```tsx
'use client';
import type { Segment } from '@/lib/types';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TranscriptEditor({
  segments, onChange, onSeek, currentTime,
}: {
  segments: Segment[]; onChange: (s: Segment[]) => void;
  onSeek: (t: number) => void; currentTime: number;
}) {
  const setText = (id: string, text: string) =>
    onChange(segments.map((s) => (s.id === id ? { ...s, text } : s)));

  if (segments.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">
        No speech was detected in this video, so there are no captions to edit.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
      <h3 className="border-b border-slate-800 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Transcript — click a time to jump, edit text inline
      </h3>
      <ul className="max-h-72 divide-y divide-slate-800/60 overflow-y-auto">
        {segments.map((seg) => {
          const active = currentTime >= seg.start && currentTime < seg.end;
          return (
            <li key={seg.id} className={`flex items-start gap-3 px-5 py-2.5 ${active ? 'bg-indigo-500/10' : ''}`}>
              <button
                onClick={() => onSeek(seg.start)}
                className="mt-1 shrink-0 font-mono text-xs text-indigo-400 hover:underline"
              >
                {fmt(seg.start)}
              </button>
              <input
                value={seg.text}
                onChange={(e) => setText(seg.id, e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600 focus:text-white"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: ExportBar (replace stub)**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { downloadUrl, exportJob, getJob, patchTranscript } from '@/lib/api';
import type { CaptionStyle, Segment } from '@/lib/types';

type State = 'idle' | 'exporting' | 'done' | 'downloaded' | 'error';

export default function ExportBar({
  jobId, style, segments, onReset,
}: { jobId: string; style: CaptionStyle; segments: Segment[]; onReset: () => void }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  async function handleExport() {
    setState('exporting');
    setError('');
    try {
      await patchTranscript(jobId, segments);
      await exportJob(jobId, style);
      timer.current = setInterval(async () => {
        const job = await getJob(jobId).catch(() => null);
        if (!job) return;
        if (job.status === 'done') { clearInterval(timer.current); setState('done'); }
        if (job.status === 'error') {
          clearInterval(timer.current); setState('error');
          setError(job.error ?? 'Export failed');
        }
      }, 1000);
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      {state === 'idle' && (
        <button onClick={handleExport} className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium hover:bg-indigo-500">
          Export video
        </button>
      )}
      {state === 'exporting' && (
        <span className="flex items-center gap-2 text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Burning captions… this takes about the length of the video
        </span>
      )}
      {state === 'done' && (
        <a
          href={downloadUrl(jobId)} download
          onClick={() => setTimeout(() => setState('downloaded'), 500)}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 font-medium hover:bg-emerald-500"
        >
          Download captioned.mp4
        </a>
      )}
      {state === 'downloaded' && (
        <span className="flex items-center gap-4">
          <span className="text-emerald-400">Downloaded — temp files deleted from the server.</span>
          <button onClick={onReset} className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600">
            Caption another video
          </button>
        </span>
      )}
      {state === 'error' && (
        <span className="flex items-center gap-4">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setState('idle')} className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600">
            Try again
          </button>
        </span>
      )}
      <span className="ml-auto text-xs text-slate-500">Preview ≈ export; box corners are square in the final render</span>
    </div>
  );
}
```

Note: after download the backend deletes the job, so the preview `videoUrl` dies — the `downloaded` state hides the need for it; user proceeds via "Caption another video".

- [ ] **Step 3: Verify build + tests**

```bash
cd frontend && npm run build && npm test
```

Expected: clean build, tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend && git commit -m "Add transcript editor and export/download flow"
```

---

### Task 14: README + GitHub repo + push

**Files:**
- Create: `README.md`, `LICENSE`

**Interfaces:**
- Produces: public repo `github.com/umairnawaz333/video-caption` with `main` pushed.

- [ ] **Step 1: Write README.md**

```markdown
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

- Node 20+, Python 3.10+, FFmpeg (`brew install ffmpeg`)

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
```

- [ ] **Step 2: Add MIT LICENSE**

Standard MIT license text, copyright `2026 Umair Nawaz`.

- [ ] **Step 3: Create repo and push**

```bash
cd /Users/umairnawaz/Projects/Video-caption
git add README.md LICENSE && git commit -m "Add README and license"
gh auth status   # verify the umairnawaz333 token is active; if not, ask the user
gh repo create umairnawaz333/video-caption --public --source . --push
```

Expected: repo URL printed; `git push` succeeds. If `gh` is missing/unauthenticated, stop and ask the user for the token rather than guessing.

- [ ] **Step 4: Verify**

```bash
gh repo view umairnawaz333/video-caption --json url,defaultBranchRef
```

Expected: URL + `main`.

---

### Task 15: Full manual E2E verification

**Files:** none (verification only)

- [ ] **Step 1: Create a real spoken test video**

```bash
say -o /tmp/vc-speech.aiff "Welcome to Captionly. This video tests automatic caption generation, styling, and burning."
ffmpeg -y -f lavfi -i color=c=0x223366:s=1280x720:d=8 -i /tmp/vc-speech.aiff -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac /tmp/vc-e2e.mp4
```

- [ ] **Step 2: Run the full flow**

Backend + frontend running → upload `/tmp/vc-e2e.mp4` → verify: stepper advances; studio shows accurate captions synced to speech; switch all 5 presets; tweak font/size/colors/background/position and watch the overlay; edit a transcript word; export; download.

- [ ] **Step 3: Verify the output file**

```bash
open ~/Downloads/captioned.mp4   # captions visible, styled as previewed, edited word present
ls ../tmp                        # Expected: only .gitkeep — job dir deleted after download
```

- [ ] **Step 4: Verify no paid calls**

`grep -ri "api.openai\|deepgram\|assemblyai\|api_key\|apikey" backend/src frontend/lib frontend/components transcriber/` — Expected: no matches.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A && git commit -m "Fix issues found in end-to-end verification"
git push
```
