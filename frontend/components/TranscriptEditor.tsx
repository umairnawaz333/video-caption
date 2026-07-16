'use client';
import type { Segment } from '@/lib/types';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TranscriptEditor({
  segments, onChange, onSeek, currentTime,
}: {
  segments: Segment[]; onChange: (s: Segment[]) => void;
  onSeek: (t: number) => void; currentTime: number;
}) {
  const setText = (id: string, text: string) =>
    onChange(segments.map((s) => (s.id === id ? { ...s, text } : s)));

  if (segments.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">
        No speech was detected in this video, so there are no captions to edit.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
      <h3 className="border-b border-slate-800 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Transcript — click a time to jump, edit text inline
      </h3>
      <ul className="max-h-72 divide-y divide-slate-800/60 overflow-y-auto">
        {segments.map((seg) => {
          const active = currentTime >= seg.start && currentTime < seg.end;
          return (
            <li key={seg.id} className={`flex items-start gap-3 px-5 py-2.5 ${active ? 'bg-indigo-500/10' : ''}`}>
              <button
                onClick={() => onSeek(seg.start)}
                className="mt-1 shrink-0 font-mono text-xs text-indigo-400 hover:underline"
              >
                {fmt(seg.start)}
              </button>
              <input
                value={seg.text}
                onChange={(e) => setText(seg.id, e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600 focus:text-white"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
