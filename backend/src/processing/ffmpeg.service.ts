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
