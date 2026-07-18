'use client';
import { useState } from 'react';
import { RTL_LANGS } from '@/lib/languages';
import type { CaptionTrack, Segment } from '@/lib/types';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const LANG_LABELS: Record<string, string> = { en: 'English' };

export default function TranscriptEditor({
  tracks, onChange, onSeek, currentTime,
}: {
  tracks: CaptionTrack[];
  onChange: (language: string, segments: Segment[]) => void;
  onSeek: (t: number) => void;
  currentTime: number;
}) {
  const [activeLang, setActiveLang] = useState(tracks[0]?.language ?? 'en');
  const track = tracks.find((t) => t.language === activeLang) ?? tracks[0];

  if (!track || track.segments.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">
        No speech was detected in this video, so there are no captions to edit.
      </p>
    );
  }

  const rtl = RTL_LANGS.has(track.language);
  const setText = (id: string, text: string) =>
    onChange(
      track.language,
      // manual edits invalidate word-level timings, so drop them for that chunk
      track.segments.map((s) => (s.id === id ? { ...s, text, words: undefined } : s)),
    );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Transcript — click a time to jump, edit text inline
        </h3>
        {tracks.length > 1 && (
          <div className="flex gap-1">
            {tracks.map((t) => (
              <button
                key={t.language}
                onClick={() => setActiveLang(t.language)}
                className={`rounded-md px-3 py-1 text-xs font-medium uppercase
                  ${t.language === (track?.language ?? '') ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                {LANG_LABELS[t.language] ?? t.language}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="max-h-72 divide-y divide-slate-800/60 overflow-y-auto">
        {track.segments.map((seg) => {
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
                dir={rtl ? 'rtl' : 'ltr'}
                onChange={(e) => setText(seg.id, e.target.value)}
                className={`w-full bg-transparent text-sm outline-none placeholder:text-slate-600 focus:text-white ${rtl ? 'text-right' : ''}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
