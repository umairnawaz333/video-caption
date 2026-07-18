import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { config } from '../config';
import { RawSegment } from './chunk';

export interface TranscriptResult {
  language: string;
  segments: RawSegment[];
}

@Injectable()
export class TranscriptionService {
  private script = config.transcriberScript;

  transcribe(audioPath: string, onProgress?: (pct: number) => void): Promise<TranscriptResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        config.pythonBin,
        [this.script, '--audio', audioPath, '--model', config.whisperModel],
        { timeout: 1_800_000 }, // 30 min hard cap
      );
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.stderr.on('data', (d) => {
        const chunk = String(d);
        err += chunk;
        if (onProgress) {
          // the sidecar emits "PROGRESS <0-100>" lines as it decodes
          for (const m of chunk.matchAll(/^PROGRESS (\d{1,3})$/gm)) {
            onProgress(Math.min(100, Number(m[1])));
          }
        }
      });
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
