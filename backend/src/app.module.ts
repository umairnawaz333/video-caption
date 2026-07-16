import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JobsModule } from './jobs/jobs.module';
import { ProcessingModule } from './processing/processing.module';
import { UploadModule } from './upload/upload.module';
import { RenderingModule } from './rendering/rendering.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    JobsModule,
    ProcessingModule,
    UploadModule,
    RenderingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
