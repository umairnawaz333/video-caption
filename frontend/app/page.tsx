'use client';
import { useCallback, useEffect, useState } from 'react';
import UploadZone from '@/components/UploadZone';
import ProcessingView from '@/components/ProcessingView';
import Studio from '@/components/Studio';
import { getJob } from '@/lib/api';
import type { PublicJob } from '@/lib/types';

type Phase =
  | { name: 'upload' }
  | { name: 'processing'; jobId: string; job: PublicJob | null }
  | { name: 'studio'; job: PublicJob }
  | { name: 'error'; message: string };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ name: 'upload' });

  useEffect(() => {
    if (phase.name !== 'processing') return;
    const timer = setInterval(async () => {
      try {
        const job = await getJob(phase.jobId);
        if (job.status === 'ready') setPhase({ name: 'studio', job });
        else if (job.status === 'error') setPhase({ name: 'error', message: job.error ?? 'Processing failed' });
        else setPhase({ name: 'processing', jobId: phase.jobId, job });
      } catch (e) {
        setPhase({ name: 'error', message: (e as Error).message });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase.name === 'processing' ? (phase as { jobId: string }).jobId : null]);

  const reset = useCallback(() => setPhase({ name: 'upload' }), []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Caption<span className="text-indigo-400">ly</span>
        </h1>
        <span className="text-xs text-slate-500">100% free · runs locally · files auto-deleted</span>
      </header>

      {phase.name === 'upload' && (
        <>
          <div className="mb-10 text-center">
            <h2 className="text-4xl font-bold">AI captions, burned in.</h2>
            <p className="mt-3 text-slate-400">Upload a video, style your captions, download the result.</p>
          </div>
          <UploadZone onUploaded={(jobId) => setPhase({ name: 'processing', jobId, job: null })} />
        </>
      )}
      {phase.name === 'processing' && <ProcessingView job={phase.job} />}
      {phase.name === 'studio' && <Studio job={phase.job} onReset={reset} />}
      {phase.name === 'error' && (
        <div className="mx-auto max-w-md text-center">
          <p className="rounded-lg bg-red-500/10 p-4 text-red-400">{phase.message}</p>
          <button onClick={reset} className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium hover:bg-indigo-500">
            Start over
          </button>
        </div>
      )}
    </main>
  );
}
