import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { JobsService } from '../jobs/jobs.service';
import { FfmpegService } from '../processing/ffmpeg.service';
import { CaptionStyle, Job } from '../jobs/types';
import { AssTrack, generateAssTracks } from './ass';
import { LANG_RENDER } from './langfonts';

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONTS = [
  'Arial', 'Georgia', 'Impact', 'Anton', 'Bangers',
  'Poppins', 'Bebas Neue', 'Archivo Black', 'Luckiest Guy', 'Pacifico',
];

export function validateStyle(input: unknown): CaptionStyle {
  const s = input as CaptionStyle;
  const ok =
    s && typeof s === 'object' &&
    FONTS.includes(s.fontFamily) &&
    typeof s.fontSizePct === 'number' && s.fontSizePct >= 1 && s.fontSizePct <= 15 &&
    typeof s.textColor === 'string' && HEX.test(s.textColor) &&
    typeof s.uppercase === 'boolean' &&
    typeof s.bold === 'boolean' &&
    typeof s.singleWord === 'boolean' &&
    s.background && typeof s.background.enabled === 'boolean' &&
    HEX.test(s.background.color) &&
    s.background.opacity >= 0 && s.background.opacity <= 1 &&
    typeof s.background.rounded === 'boolean' &&
    s.outline && typeof s.outline.enabled === 'boolean' && HEX.test(s.outline.color) &&
    s.highlight && typeof s.highlight.enabled === 'boolean' && HEX.test(s.highlight.color) &&
    ['color', 'box'].includes(s.highlight.mode) &&
    typeof s.wordLagSec === 'number' && s.wordLagSec >= -0.5 && s.wordLagSec <= 0.5 &&
    ['top', 'middle', 'bottom'].includes(s.position) &&
    typeof s.verticalOffsetPct === 'number' && s.verticalOffsetPct >= 0 && s.verticalOffsetPct <= 40;
  if (!ok) throw new BadRequestException('invalid caption style');
  return s;
}

/** Display-order language list for export: 1-2 codes, each an existing track. */
export function validateLanguages(job: Job, input: unknown): string[] {
  if (input === undefined) return [job.tracks[0].language];
  const langs = input as string[];
  const ok =
    Array.isArray(langs) &&
    langs.length >= 1 && langs.length <= 2 &&
    langs.every((l) => typeof l === 'string') &&
    new Set(langs).size === langs.length &&
    langs.every((l) => job.tracks.some((t) => t.language === l));
  if (!ok) throw new BadRequestException('invalid caption languages');
  return langs;
}

@Injectable()
export class RenderingService {
  private logger = new Logger(RenderingService.name);

  constructor(private jobs: JobsService, private ffmpeg: FfmpegService) {}

  async export(jobId: string, style: CaptionStyle, languages?: string[]): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new BadRequestException('job not found');
    if (!['ready', 'done'].includes(job.status) || !job.video || !job.tracks[0]) {
      throw new BadRequestException('job is not ready for export');
    }
    const langs = validateLanguages(job, languages);
    const input = fs.readdirSync(job.dir).find((f) => f.startsWith('input'));
    if (!input) throw new BadRequestException('input video missing');

    this.jobs.update(jobId, { status: 'rendering' });
    try {
      const tracks: AssTrack[] = langs.map((lang) => ({
        segments: job.tracks.find((t) => t.language === lang)!.segments,
        fontFamily: LANG_RENDER[lang]?.font,
        fontScale: LANG_RENDER[lang]?.scale,
      }));
      const assPath = path.join(job.dir, 'captions.ass');
      fs.writeFileSync(
        assPath,
        generateAssTracks(tracks, style, {
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
