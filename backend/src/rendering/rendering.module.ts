import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProcessingModule } from '../processing/processing.module';
import { RenderingController } from './rendering.controller';
import { RenderingService } from './rendering.service';

@Module({
  imports: [JobsModule, ProcessingModule],
  controllers: [RenderingController],
  providers: [RenderingService],
})
export class RenderingModule {}
