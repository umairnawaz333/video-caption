import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { FfmpegService } from './ffmpeg.service';
import { TranscriptionService } from './transcription.service';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [JobsModule],
  providers: [FfmpegService, TranscriptionService, PipelineService],
  exports: [FfmpegService, TranscriptionService, PipelineService],
})
export class ProcessingModule {}
