import {
  BadRequestException, Controller, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { JobsService } from '../jobs/jobs.service';
import { PipelineService } from '../processing/pipeline.service';

const ALLOWED_EXT = ['.mp4', '.mov', '.avi'];
const ALLOWED_MIME = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'];

@Controller('upload')
export class UploadController {
  constructor(private jobs: JobsService, private pipeline: PipelineService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: config.tmpRoot,
        filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
      }),
      limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.mimetype)) {
          return cb(new BadRequestException('Only MP4, MOV or AVI videos are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No video file provided');
    const job = this.jobs.create();
    const ext = path.extname(file.originalname).toLowerCase();
    const inputPath = path.join(job.dir, `input${ext}`);
    fs.renameSync(file.path, inputPath);
    void this.pipeline.process(job.id, inputPath); // async, not awaited
    return { jobId: job.id };
  }
}
