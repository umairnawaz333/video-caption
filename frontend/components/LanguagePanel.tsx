'use client';
import { useEffect, useRef, useState } from 'react';
import { getJob, getLanguages, translateJob } from '@/lib/api';
import type { LanguageInfo, PublicJob } from '@/lib/types';

/**
 * Add translated caption tracks and choose which 1-2 are displayed.
 * `shown` is the display order: first = top line, second = bottom line.
 */
export default function LanguagePanel({
  jobId, trackLangs, shown, onShownChange, onJobUpdate,
}: {
  jobId: string;
  trackLangs: string[];               // languages that already have tracks
  shown: string[];                    // 1-2 codes currently displayed
  onShownChange: (shown: string[]) => void;
  onJobUpdate: (job: PublicJob) => void;
}) {
  const [available, setAvailable] = useState<LanguageInfo[]>([]);
  const [selected, setSelected] = useState('');
  const [translating, setTranslating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    getLanguages().then(setAvailable).catch(() => setAvailable([]));
    return () => clearInterval(timer.current);
  }, []);

  const addable = available.filter((l) => !trackLangs.includes(l.code));
  const nameOf = (code: string) =>
    code === 'en' ? 'English' : available.find((l) => l.code === code)?.name ?? code.toUpperCase();

  async function handleAdd() {
    if (!selected) return;
    setError('');
    setTranslating(selected);
    try {
      await translateJob(jobId, selected);
      timer.current = setInterval(async () => {
        const job = await getJob(jobId).catch(() => null);
        if (!job) return;
        if (job.translateError) {
          clearInterval(timer.current);
          setTranslating(null);
          setError(job.translateError);
          onJobUpdate(job);
        } else if (!job.translating) {
          clearInterval(timer.current);
          setTranslating(null);
          setSelected('');
          onJobUpdate(job);
        }
      }, 1000);
    } catch (e) {
      setTranslating(null);
      setError((e as Error).message);
    }
  }

  function toggleShown(code: string) {
    if (shown.includes(code)) {
      if (shown.length > 1) onShownChange(shown.filter((c) => c !== code)); // keep min 1
    } else if (shown.length < 2) {
      onShownChange([...shown, code]);
    } else {
      onShownChange([shown[0], code]); // replace the second line
    }
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Languages
      </h3>

      <div className="flex flex-wrap gap-2">
        {trackLangs.map((code) => {
          const active = shown.includes(code);
          const order = shown.indexOf(code);
          return (
            <button
              key={code}
              onClick={() => toggleShown(code)}
              title={active ? 'Click to hide' : 'Click to show'}
              className={`rounded-lg border px-3 py-1.5 text-sm transition
                ${active ? 'border-indigo-400 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              {active && shown.length === 2 && (
                <span className="mr-1.5 font-mono text-xs opacity-70">{order === 0 ? '↑' : '↓'}</span>
              )}
              {nameOf(code)}
            </button>
          );
        })}
        {shown.length === 2 && (
          <button
            onClick={() => onShownChange([shown[1], shown[0]])}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            title="Swap which language is on top"
          >
            ⇅ Swap
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={translating !== null}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm disabled:opacity-40"
        >
          <option value="">Add a language…</option>
          {addable.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!selected || translating !== null}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
        >
          {translating ? 'Translating…' : 'Add'}
        </button>
      </div>
      {translating && (
        <p className="mt-2 text-xs text-slate-500">
          Translating locally — first use of a language downloads its pack (~100-300 MB), which can take a few minutes.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-slate-600">Show up to 2 languages — they stack on the video.</p>
    </div>
  );
}
