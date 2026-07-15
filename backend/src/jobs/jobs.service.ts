import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { Job } from './types';

@Injectable()
export class JobsService {
  private jobs = new Map<string, Job>();

  create(): Job {
    const id = randomUUID();
    const dir = path.join(config.tmpRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    const job: Job = { id, status: 'uploading', tracks: [], createdAt: Date.now(), dir };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Job>): Job {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`job ${id} not found`);
    Object.assign(job, patch);
    return job;
  }

  remove(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    fs.rmSync(job.dir, { recursive: true, force: true });
    this.jobs.delete(id);
  }

  all(): Job[] {
    return [...this.jobs.values()];
  }

  toPublic(job: Job): Omit<Job, 'dir'> {
    const { dir: _dir, ...pub } = job;
    return pub;
  }
}
