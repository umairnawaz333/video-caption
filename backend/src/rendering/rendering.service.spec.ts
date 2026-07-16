import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { RenderingService, validateStyle } from './rendering.service';
import { CaptionStyle } from '../jobs/types';

const style: CaptionStyle = {
  fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
  background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
  outline: { enabled: false, color: '#000000' },
  position: 'bottom', verticalOffsetPct: 5,
};

describe('validateStyle', () => {
  it('accepts a valid style', () => {
    expect(validateStyle(style)).toEqual(style);
  });
  it('rejects bad values', () => {
    expect(() => validateStyle({ ...style, position: 'left' })).toThrow();
    expect(() => validateStyle({ ...style, fontSizePct: 90 })).toThrow();
    expect(() => validateStyle({ ...style, textColor: 'red' })).toThrow();
    expect(() => validateStyle(null)).toThrow();
  });
});

describe('RenderingService', () => {
  let jobs: JobsService;
  let ffmpeg: { burnSubtitles: jest.Mock };
  let service: RenderingService;

  beforeEach(() => {
    jobs = new JobsService();
    ffmpeg = {
      burnSubtitles: jest.fn(async (_i, _a, _f, out) => fs.writeFileSync(out, 'mp4')),
    };
    service = new RenderingService(jobs, ffmpeg as any);
  });
  afterEach(() => jobs.all().forEach((j) => jobs.remove(j.id)));

  function readyJob() {
    const job = jobs.create();
    fs.writeFileSync(path.join(job.dir, 'input.mp4'), 'x');
    jobs.update(job.id, {
      status: 'ready',
      video: { filename: 'input.mp4', duration: 2, width: 640, height: 360 },
      tracks: [{ language: 'en', segments: [{ id: '1', start: 0, end: 1, text: 'hi' }] }],
    });
    return job;
  }

  it('writes ass, burns, and marks done', async () => {
    const job = readyJob();
    await service.export(job.id, style);
    expect(jobs.get(job.id)!.status).toBe('done');
    const ass = fs.readFileSync(path.join(job.dir, 'captions.ass'), 'utf8');
    expect(ass).toContain('Dialogue:');
    expect(ffmpeg.burnSubtitles).toHaveBeenCalled();
  });

  it('sets error status when burn fails', async () => {
    const job = readyJob();
    ffmpeg.burnSubtitles.mockRejectedValueOnce(new Error('boom'));
    await service.export(job.id, style);
    expect(jobs.get(job.id)!.status).toBe('error');
    expect(jobs.get(job.id)!.error).toMatch(/boom/);
  });

  it('rejects export when transcript not ready', async () => {
    const job = jobs.create();
    await expect(service.export(job.id, style)).rejects.toThrow(/not ready/i);
  });
});
