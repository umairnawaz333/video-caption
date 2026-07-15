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
