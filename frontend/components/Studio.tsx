'use client';
import type { PublicJob } from '@/lib/types';

export default function Studio({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  return <div>Studio for job {job.id} <button onClick={onReset}>reset</button></div>;
}
