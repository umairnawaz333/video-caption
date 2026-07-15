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
