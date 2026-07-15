import * as fs from 'fs';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  beforeEach(() => { service = new JobsService(); });
  afterEach(() => { service.all().forEach((j) => service.remove(j.id)); });

  it('creates a job with a tmp dir and empty tracks', () => {
    const job = service.create();
    expect(job.status).toBe('uploading');
    expect(job.tracks).toEqual([]);
    expect(fs.existsSync(job.dir)).toBe(true);
    expect(service.get(job.id)).toBe(job);
  });

  it('updates a job', () => {
    const job = service.create();
    service.update(job.id, { status: 'ready' });
    expect(service.get(job.id)!.status).toBe('ready');
  });

  it('remove deletes dir and entry', () => {
    const job = service.create();
    service.remove(job.id);
    expect(service.get(job.id)).toBeUndefined();
    expect(fs.existsSync(job.dir)).toBe(false);
  });

  it('toPublic strips dir', () => {
    const job = service.create();
    expect((service.toPublic(job) as any).dir).toBeUndefined();
  });
});
