import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import { AppModule } from '../src/app.module';
import { FfmpegService } from '../src/processing/ffmpeg.service';
import { TranscriptionService } from '../src/processing/transcription.service';
import { JobsService } from '../src/jobs/jobs.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('upload → transcribe flow (e2e, stubbed processors)', () => {
  let app: INestApplication;
  let jobs: JobsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FfmpegService)
      .useValue({
        probe: async () => ({ duration: 2, width: 640, height: 360 }),
        extractAudio: async (_i: string, out: string) => fs.writeFileSync(out, 'wav'),
        burnSubtitles: async (_i: string, _a: string, _f: string, out: string) =>
          fs.writeFileSync(out, 'mp4'),
      })
      .overrideProvider(TranscriptionService)
      .useValue({
        transcribe: async () => ({
          language: 'en',
          segments: [{ start: 0, end: 1, text: 'hello world' }],
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    jobs = moduleRef.get(JobsService);
  });

  afterAll(async () => {
    jobs.all().forEach((j) => jobs.remove(j.id));
    await app.close();
  });

  it('rejects non-video uploads', async () => {
    await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('nope'), { filename: 'evil.exe', contentType: 'application/octet-stream' })
      .expect(400);
  });

  it('uploads, processes, edits transcript', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake-video-bytes'), { filename: 'clip.mp4', contentType: 'video/mp4' })
      .expect(201);
    const { jobId } = res.body;
    expect(jobId).toBeDefined();

    let job: any;
    for (let i = 0; i < 50; i++) {
      job = (await request(app.getHttpServer()).get(`/api/jobs/${jobId}`).expect(200)).body;
      if (job.status === 'ready' || job.status === 'error') break;
      await sleep(100);
    }
    expect(job.status).toBe('ready');
    expect(job.tracks[0].language).toBe('en');
    expect(job.tracks[0].segments[0].text).toBe('hello world');
    expect(job.dir).toBeUndefined();

    const seg = { ...job.tracks[0].segments[0], text: 'hello edited' };
    const patched = await request(app.getHttpServer())
      .patch(`/api/jobs/${jobId}/transcript`)
      .send({ segments: [seg] })
      .expect(200);
    expect(patched.body.tracks[0].segments[0].text).toBe('hello edited');
  });

  it('404s on unknown job', async () => {
    await request(app.getHttpServer()).get('/api/jobs/nope').expect(404);
  });
});
