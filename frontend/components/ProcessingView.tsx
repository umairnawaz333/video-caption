'use client';
import { useEffect, useRef } from 'react';
import type { PublicJob } from '@/lib/types';

const STEPS = [
  { key: 'extracting', label: 'Extracting audio' },
  { key: 'transcribing', label: 'Generating captions (local AI)' },
] as const;

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `~${m}m ${String(s).padStart(2, '0')}s left`;
}

export default function ProcessingView({ job }: { job: PublicJob | null }) {
  const status = job?.status;
  const activeIdx = STEPS.findIndex((s) => s.key === status);
  const allDone = status === 'ready';
  const progress = status === 'transcribing' ? (job?.progress ?? 0) : 0;

  // wall-clock start of the transcribing step, for the ETA estimate
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (status === 'transcribing' && startedAt.current === null) {
      startedAt.current = Date.now();
    }
    if (status !== 'transcribing') startedAt.current = null;
  }, [status]);

  let eta: string | null = null;
  if (status === 'transcribing' && startedAt.current !== null && progress >= 5) {
    const elapsed = (Date.now() - startedAt.current) / 1000;
    eta = formatEta((elapsed * (100 - progress)) / progress);
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mb-8 text-5xl animate-pulse">🎙️</div>
      <ul className="space-y-4 text-left">
        {STEPS.map((step, i) => {
          const stepDone = allDone || activeIdx > i;
          const active = activeIdx === i;
          return (
            <li key={step.key}>
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm
                    ${stepDone ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-800 text-slate-500'}`}
                >
                  {stepDone ? '✓' : i + 1}
                </span>
                <span className={active ? 'text-slate-100' : 'text-slate-400'}>{step.label}</span>
                {active && step.key === 'transcribing' && (
                  <span className="ml-auto font-mono text-sm text-indigo-300">{progress}%</span>
                )}
              </div>
              {active && step.key === 'transcribing' && (
                <div className="ml-10 mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {eta && <p className="mt-1.5 text-xs text-slate-500">{eta}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-sm text-slate-500">
        Transcription runs locally with Whisper — longer videos take a few minutes.
      </p>
    </div>
  );
}
