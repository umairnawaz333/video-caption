import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, Patch, Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
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

  @SkipThrottle()
  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.jobs.toPublic(this.find(id));
  }

  @Patch(':id/transcript')
  patchTranscript(
    @Param('id') id: string,
    @Body() body: { segments: Segment[]; language?: string },
  ) {
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
    const track = body.language
      ? job.tracks.find((t) => t.language === body.language)
      : job.tracks[0];
    if (!track) throw new BadRequestException('transcript not ready');
    track.segments = body.segments;
    return this.jobs.toPublic(job);
  }

  @SkipThrottle()
  @Get(':id/video')
  getVideo(@Param('id') id: string, @Res() res: Response) {
    const job = this.find(id);
    const input = fs.readdirSync(job.dir).find((f) => f.startsWith('input'));
    if (!input) throw new NotFoundException('Video file not found');
    res.sendFile(path.join(job.dir, input)); // express handles Range requests
  }
}
