import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { chunkSegments } from './chunk';
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
          // short one-line chunks that flip quickly as speech flows
          segments: chunkSegments(result.segments),
        }],
      });
    } catch (e) {
      this.logger.error(`job ${jobId} failed`, e as Error);
      this.jobs.update(jobId, { status: 'error', error: (e as Error).message });
    }
  }
}
