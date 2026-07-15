import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]), JobsModule],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
