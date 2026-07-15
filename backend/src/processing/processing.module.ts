import { Module } from '@nestjs/common';
import { FfmpegService } from './ffmpeg.service';
import { TranscriptionService } from './transcription.service';

@Module({ providers: [FfmpegService, TranscriptionService], exports: [FfmpegService, TranscriptionService] })
export class ProcessingModule {}
