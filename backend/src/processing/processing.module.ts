import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { FfmpegService } from './ffmpeg.service';
import { TranscriptionService } from './transcription.service';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [JobsModule],
  controllers: [TranslationController],
  providers: [FfmpegService, TranscriptionService, TranslationService, PipelineService],
  exports: [FfmpegService, TranscriptionService, TranslationService, PipelineService],
})
export class ProcessingModule {}
