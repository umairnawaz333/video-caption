'use client';
import { useEffect, useRef, useState } from 'react';
import { downloadUrl, exportJob, getJob, patchTranscript } from '@/lib/api';
import type { CaptionStyle, Segment } from '@/lib/types';

type State = 'idle' | 'exporting' | 'done' | 'downloaded' | 'error';

export default function ExportBar({
  jobId, style, segments, onReset,
}: { jobId: string; style: CaptionStyle; segments: Segment[]; onReset: () => void }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  async function handleExport() {
    setState('exporting');
    setError('');
    try {
      await patchTranscript(jobId, segments);
      await exportJob(jobId, style);
      timer.current = setInterval(async () => {
        const job = await getJob(jobId).catch(() => null);
        if (!job) return;
        if (job.status === 'done') { clearInterval(timer.current); setState('done'); }
        if (job.status === 'error') {
          clearInterval(timer.current); setState('error');
          setError(job.error ?? 'Export failed');
        }
      }, 1000);
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      {state === 'idle' && (
        <button onClick={handleExport} className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium hover:bg-indigo-500">
          Export video
        </button>
      )}
      {state === 'exporting' && (
        <span className="flex items-center gap-2 text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Burning captions… this takes about the length of the video
        </span>
      )}
      {state === 'done' && (
        <a
          href={downloadUrl(jobId)} download
          onClick={() => setTimeout(() => setState('downloaded'), 500)}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 font-medium hover:bg-emerald-500"
        >
          Download captioned.mp4
        </a>
      )}
      {state === 'downloaded' && (
        <span className="flex items-center gap-4">
          <span className="text-emerald-400">Downloaded — temp files deleted from the server.</span>
          <button onClick={onReset} className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600">
            Caption another video
          </button>
        </span>
      )}
      {state === 'error' && (
        <span className="flex items-center gap-4">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setState('idle')} className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600">
            Try again
          </button>
        </span>
      )}
      <span className="ml-auto text-xs text-slate-500">Preview ≈ export; box corners are square in the final render</span>
    </div>
  );
}
