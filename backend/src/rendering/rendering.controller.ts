import {
  BadRequestException, Body, Controller, Get, HttpCode,
  NotFoundException, Param, Post, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { RenderingService, validateLanguages, validateStyle } from './rendering.service';

@Controller('jobs')
export class RenderingController {
  constructor(private jobs: JobsService, private rendering: RenderingService) {}

  @Post(':id/export')
  @HttpCode(202)
  export(@Param('id') id: string, @Body() body: { style: unknown; languages?: unknown }) {
    const style = validateStyle(body?.style);
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found');
    if (!['ready', 'done'].includes(job.status)) {
      throw new BadRequestException('transcript is not ready yet');
    }
    const languages = validateLanguages(job, body?.languages);
    void this.rendering.export(id, style, languages); // async; client polls GET /jobs/:id
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
