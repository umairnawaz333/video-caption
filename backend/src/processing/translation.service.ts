import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import { config } from '../config';

export interface LanguageInfo {
  code: string;
  name: string;
  installed: boolean;
}

export type TranslateStatus = 'downloading' | 'translating';

const LIST_CACHE_MS = 600_000;

@Injectable()
export class TranslationService {
  private langsScript = path.join(path.dirname(config.transcriberScript), 'langs.py');
  private translateScript = path.join(path.dirname(config.transcriberScript), 'translate.py');
  private cache: { at: number; list: LanguageInfo[] } | null = null;

  async listLanguages(): Promise<LanguageInfo[]> {
    if (this.cache && Date.now() - this.cache.at < LIST_CACHE_MS) return this.cache.list;
    const out = await this.run(this.langsScript, [], undefined, undefined, 120_000);
    const list = JSON.parse(out) as LanguageInfo[];
    this.cache = { at: Date.now(), list };
    return list;
  }

  async translate(
    texts: string[],
    to: string,
    onStatus?: (status: TranslateStatus) => void,
  ): Promise<string[]> {
    const out = await this.run(
      this.translateScript,
      ['--to', to],
      JSON.stringify({ texts }),
      onStatus,
      1_800_000, // first use downloads the language pack
    );
    const parsed = JSON.parse(out) as { translations: string[] };
    if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length) {
      throw new Error('translator returned a mismatched result');
    }
    return parsed.translations;
  }

  private run(
    script: string,
    args: string[],
    stdin?: string,
    onStatus?: (status: TranslateStatus) => void,
    timeoutMs = 600_000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(config.pythonBin, [script, ...args], { timeout: timeoutMs });
      proc.stdin.on('error', () => undefined); // EPIPE if the script exits early
      if (stdin !== undefined) proc.stdin.write(stdin);
      proc.stdin.end();
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.stderr.on('data', (d) => {
        const chunk = String(d);
        err += chunk;
        if (onStatus) {
          for (const m of chunk.matchAll(/^STATUS (downloading|translating)$/gm)) {
            onStatus(m[1] as TranslateStatus);
          }
        }
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`translator exited ${code}: ${err.slice(-500)}`));
        resolve(out);
      });
    });
  }
}
