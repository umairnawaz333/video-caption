import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(CleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private jobs: JobsService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sweep(), 600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  sweep(now = Date.now()) {
    for (const job of this.jobs.all()) {
      if (now - job.createdAt > config.jobTtlMs) {
        this.logger.log(`TTL sweep: removing job ${job.id}`);
        this.jobs.remove(job.id);
      }
    }
  }
}
