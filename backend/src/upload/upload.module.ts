import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProcessingModule } from '../processing/processing.module';
import { UploadController } from './upload.controller';

@Module({ imports: [JobsModule, ProcessingModule], controllers: [UploadController] })
export class UploadModule {}
