import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { CleanupService } from '../cleanup/cleanup.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, CleanupService],
  exports: [JobsService],
})
export class JobsModule {}
