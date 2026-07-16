'use client';
import type { PublicJob } from '@/lib/types';

const STEPS = [
  { key: 'extracting', label: 'Extracting audio' },
  { key: 'transcribing', label: 'Generating captions (local AI)' },
] as const;

export default function ProcessingView({ job }: { job: PublicJob | null }) {
  const activeIdx = STEPS.findIndex((s) => s.key === job?.status);
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mb-8 text-5xl animate-pulse">🎙️</div>
      <ul className="space-y-4 text-left">
        {STEPS.map((step, i) => {
          const stepDone = activeIdx > i || (activeIdx === -1 && job != null);
          const active = activeIdx === i;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm
                  ${stepDone ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-800 text-slate-500'}`}
              >
                {stepDone ? '✓' : i + 1}
              </span>
              <span className={active ? 'text-slate-100' : 'text-slate-400'}>{step.label}</span>
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
