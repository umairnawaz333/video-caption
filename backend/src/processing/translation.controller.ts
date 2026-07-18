import {
  BadRequestException, Body, Controller, Get, HttpCode,
  Logger, NotFoundException, Param, Post,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JobsService } from '../jobs/jobs.service';
import { TranslationService } from './translation.service';

@Controller()
export class TranslationController {
  private logger = new Logger(TranslationController.name);

  constructor(private jobs: JobsService, private translation: TranslationService) {}

  @Get('languages')
  async languages() {
    return this.translation.listLanguages();
  }

  @Post('jobs/:id/translate')
  @HttpCode(202)
  async translate(@Param('id') id: string, @Body() body: { language?: string }) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found');
    const lang = body?.language;
    if (typeof lang !== 'string' || !/^[a-z]{2,3}$/.test(lang)) {
      throw new BadRequestException('invalid language code');
    }
    if (!['ready', 'done'].includes(job.status) || !job.tracks[0]) {
      throw new BadRequestException('transcript is not ready yet');
    }
    if (job.translating) throw new BadRequestException('a translation is already running');
    if (job.tracks.some((t) => t.language === lang)) {
      throw new BadRequestException('this language was already added');
    }
    const known = await this.translation.listLanguages();
    if (!known.some((l) => l.code === lang)) {
      throw new BadRequestException('language not available');
    }

    this.jobs.update(id, { translating: lang, translateError: undefined });
    void this.runTranslation(id, lang); // async; client polls GET /jobs/:id
    return { ok: true };
  }

  private async runTranslation(jobId: string, lang: string): Promise<void> {
    try {
      const job = this.jobs.get(jobId);
      if (!job) return;
      const source = job.tracks[0].segments;
      const texts = source.map((s) => s.text);
      const translations = await this.translation.translate(texts, lang);
      const current = this.jobs.get(jobId);
      if (!current) return; // job was downloaded/cleaned up meanwhile
      current.tracks.push({
        language: lang,
        segments: source.map((s, i) => ({
          id: randomUUID(),
          start: s.start,
          end: s.end,
          text: translations[i],
        })),
      });
      this.jobs.update(jobId, { translating: null });
    } catch (e) {
      this.logger.error(`translate ${jobId} -> ${lang} failed`, e as Error);
      if (this.jobs.get(jobId)) {
        this.jobs.update(jobId, { translating: null, translateError: (e as Error).message });
      }
    }
  }
}
