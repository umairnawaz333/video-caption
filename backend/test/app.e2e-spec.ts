import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import { AppModule } from '../src/app.module';
import { FfmpegService } from '../src/processing/ffmpeg.service';
import { TranscriptionService } from '../src/processing/transcription.service';
import { TranslationService } from '../src/processing/translation.service';
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
      .overrideProvider(TranslationService)
      .useValue({
        listLanguages: async () => [
          { code: 'ur', name: 'Urdu', installed: true },
          { code: 'es', name: 'Spanish', installed: false },
        ],
        translate: async (texts: string[], to: string) => texts.map((t) => `${to.toUpperCase()}:${t}`),
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

  it('exports and downloads, then job is deleted', async () => {
    const up = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake'), { filename: 'c.mp4', contentType: 'video/mp4' })
      .expect(201);
    const id = up.body.jobId;
    for (let i = 0; i < 50; i++) {
      const { body } = await request(app.getHttpServer()).get(`/api/jobs/${id}`);
      if (body.status === 'ready') break;
      await sleep(100);
    }

    const style = {
      fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
      background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
      uppercase: false, bold: false, singleWord: false,
      outline: { enabled: false, color: '#000000' },
      highlight: { enabled: false, color: '#FDE047', mode: 'color' },
      wordLagSec: 0,
      position: 'bottom', verticalOffsetPct: 5,
    };
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/export`).send({ style }).expect(202);

    for (let i = 0; i < 50; i++) {
      const { body } = await request(app.getHttpServer()).get(`/api/jobs/${id}`);
      if (body.status === 'done') break;
      await sleep(100);
    }

    await request(app.getHttpServer()).get(`/api/jobs/${id}/download`).expect(200);
    await request(app.getHttpServer()).get(`/api/jobs/${id}`).expect(404); // cleaned up
  });

  it('does not rate-limit job polling (GET /api/jobs/:id)', async () => {
    const { id } = jobs.create();
    for (let i = 0; i < 40; i++) {
      await request(app.getHttpServer()).get(`/api/jobs/${id}`).expect(200);
    }
  });

  it('rejects export with invalid style', async () => {
    const up = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake'), { filename: 'd.mp4', contentType: 'video/mp4' })
      .expect(201);
    await sleep(300);
    await request(app.getHttpServer())
      .post(`/api/jobs/${up.body.jobId}/export`)
      .send({ style: { fontFamily: 'Wingdings' } })
      .expect(400);
  });
  it('lists languages, translates to urdu, edits urdu, exports both', async () => {
    const up = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('file', Buffer.from('fake'), { filename: 'ml.mp4', contentType: 'video/mp4' })
      .expect(201);
    const id = up.body.jobId;
    let job: any;
    for (let i = 0; i < 50; i++) {
      job = (await request(app.getHttpServer()).get(`/api/jobs/${id}`)).body;
      if (job.status === 'ready') break;
      await sleep(100);
    }

    const langs = await request(app.getHttpServer()).get('/api/languages').expect(200);
    expect(langs.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ur', name: 'Urdu' })]),
    );

    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/translate`).send({ language: 'ur' }).expect(202);
    for (let i = 0; i < 50; i++) {
      job = (await request(app.getHttpServer()).get(`/api/jobs/${id}`)).body;
      if (job.tracks.length === 2 && !job.translating) break;
      await sleep(100);
    }
    expect(job.tracks[1].language).toBe('ur');
    expect(job.tracks[1].segments[0].text).toBe('UR:hello world');
    expect(job.tracks[1].segments[0].start).toBe(0);

    // duplicate + unknown language rejections
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/translate`).send({ language: 'ur' }).expect(400);
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/translate`).send({ language: 'xx' }).expect(400);

    // edit the urdu track only
    const urSeg = { ...job.tracks[1].segments[0], text: 'UR:edited' };
    const patched = await request(app.getHttpServer())
      .patch(`/api/jobs/${id}/transcript`)
      .send({ segments: [urSeg], language: 'ur' })
      .expect(200);
    expect(patched.body.tracks[1].segments[0].text).toBe('UR:edited');
    expect(patched.body.tracks[0].segments[0].text).toBe('hello world');

    // export with both languages (urdu on top)
    const style = {
      fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
      uppercase: false, bold: false, singleWord: false,
      background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: false, color: '#000000' },
      highlight: { enabled: false, color: '#FDE047', mode: 'color' },
      wordLagSec: 0,
      position: 'bottom', verticalOffsetPct: 5,
    };
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/export`).send({ style, languages: ['ur', 'en'] }).expect(202);
    for (let i = 0; i < 50; i++) {
      job = (await request(app.getHttpServer()).get(`/api/jobs/${id}`)).body;
      if (job.status === 'done') break;
      await sleep(100);
    }
    expect(job.status).toBe('done');

    // bad language lists rejected
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/export`).send({ style, languages: ['fr'] }).expect(400);
    await request(app.getHttpServer())
      .post(`/api/jobs/${id}/export`).send({ style, languages: ['en', 'en'] }).expect(400);

    // the translated track can be removed; the original cannot
    await request(app.getHttpServer())
      .delete(`/api/jobs/${id}/tracks/en`).expect(400);
    const afterDelete = await request(app.getHttpServer())
      .delete(`/api/jobs/${id}/tracks/ur`).expect(200);
    expect(afterDelete.body.tracks).toHaveLength(1);
    await request(app.getHttpServer())
      .delete(`/api/jobs/${id}/tracks/ur`).expect(404);
  });

});
