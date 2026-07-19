'use client';
import { FONTS, PRESETS } from '@/lib/presets';
import type { CaptionStyle } from '@/lib/types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export default function StyleControls({
  style, onChange, isPrimary = true, hasWords = true,
}: {
  style: CaptionStyle;
  onChange: (s: CaptionStyle) => void;
  isPrimary?: boolean; // position controls live on the first displayed language
  hasWords?: boolean;  // word-level features need word timings (original track only)
}) {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...style, ...patch, preset: undefined });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Presets</h3>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...p.style })}
              className={`rounded-lg border px-3 py-2 text-sm transition
                ${style.preset === p.id ? 'border-indigo-400 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 hover:border-slate-500'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Text</h3>
        <Row label="Font">
          <select
            value={style.fontFamily}
            onChange={(e) => set({ fontFamily: e.target.value })}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          >
            {FONTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Row>
        <Row label={`Size (${style.fontSizePct.toFixed(1)}%)`}>
          <input
            type="range" min={2} max={10} step={0.5} value={style.fontSizePct}
            onChange={(e) => set({ fontSizePct: Number(e.target.value) })}
            className="w-40 accent-indigo-500"
          />
        </Row>
        <Row label="Text color">
          <input
            type="color" value={style.textColor}
            onChange={(e) => set({ textColor: e.target.value.toUpperCase() })}
            className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900"
          />
        </Row>
        <Row label="Uppercase">
          <input
            type="checkbox" checked={style.uppercase}
            onChange={(e) => set({ uppercase: e.target.checked })}
            className="accent-indigo-500"
          />
        </Row>
        <Row label="Bold">
          <input
            type="checkbox" checked={style.bold}
            onChange={(e) => set({ bold: e.target.checked })}
            className="accent-indigo-500"
          />
        </Row>
        {hasWords && (
          <Row label="One word at a time">
            <input
              type="checkbox" checked={style.singleWord}
              onChange={(e) => set({ singleWord: e.target.checked })}
              className="accent-indigo-500"
            />
          </Row>
        )}
        <Row label="Outline">
          <span className="flex items-center gap-2">
            <input
              type="checkbox" checked={style.outline.enabled}
              onChange={(e) => set({ outline: { ...style.outline, enabled: e.target.checked } })}
              className="accent-indigo-500"
            />
            <input
              type="color" value={style.outline.color} disabled={!style.outline.enabled}
              onChange={(e) => set({ outline: { ...style.outline, color: e.target.value.toUpperCase() } })}
              className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900 disabled:opacity-30"
            />
          </span>
        </Row>
        {hasWords && (
          <>
            <Row label="Highlight spoken word">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox" checked={style.highlight.enabled}
                  onChange={(e) => set({ highlight: { ...style.highlight, enabled: e.target.checked } })}
                  className="accent-indigo-500"
                />
                <select
                  value={style.highlight.mode} disabled={!style.highlight.enabled}
                  onChange={(e) => set({ highlight: { ...style.highlight, mode: e.target.value as 'color' | 'box' } })}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm disabled:opacity-30"
                >
                  <option value="color">Color</option>
                  <option value="box">Box</option>
                </select>
                <input
                  type="color" value={style.highlight.color} disabled={!style.highlight.enabled}
                  onChange={(e) => set({ highlight: { ...style.highlight, color: e.target.value.toUpperCase() } })}
                  className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900 disabled:opacity-30"
                />
              </span>
            </Row>
            <Row label={`Word sync (${style.wordLagSec >= 0 ? '+' : ''}${style.wordLagSec.toFixed(2)}s)`}>
              <input
                type="range" min={-0.3} max={0.3} step={0.05} value={style.wordLagSec}
                disabled={!style.highlight.enabled && !style.singleWord}
                onChange={(e) => set({ wordLagSec: Number(e.target.value) })}
                className="w-40 accent-indigo-500 disabled:opacity-30"
              />
            </Row>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Background</h3>
        <Row label="Show box">
          <input
            type="checkbox" checked={style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, enabled: e.target.checked } })}
            className="accent-indigo-500"
          />
        </Row>
        <Row label="Box color">
          <input
            type="color" value={style.background.color} disabled={!style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, color: e.target.value.toUpperCase() } })}
            className="h-8 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900 disabled:opacity-30"
          />
        </Row>
        <Row label={`Opacity (${Math.round(style.background.opacity * 100)}%)`}>
          <input
            type="range" min={0.1} max={1} step={0.05} value={style.background.opacity}
            disabled={!style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, opacity: Number(e.target.value) } })}
            className="w-40 accent-indigo-500 disabled:opacity-30"
          />
        </Row>
        <Row label="Rounded corners">
          <input
            type="checkbox" checked={style.background.rounded} disabled={!style.background.enabled}
            onChange={(e) => set({ background: { ...style.background, rounded: e.target.checked } })}
            className="accent-indigo-500 disabled:opacity-30"
          />
        </Row>
      </div>

      {isPrimary ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Position</h3>
          <Row label="Anchor">
            <div className="flex gap-1">
              {(['top', 'middle', 'bottom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => set({ position: p })}
                  className={`rounded-md px-3 py-1.5 text-sm capitalize
                    ${style.position === p ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Row>
          <Row label={`Offset (${style.verticalOffsetPct}%)`}>
            <input
              type="range" min={0} max={40} step={1} value={style.verticalOffsetPct}
              disabled={style.position === 'middle'}
              onChange={(e) => set({ verticalOffsetPct: Number(e.target.value) })}
              className="w-40 accent-indigo-500 disabled:opacity-30"
            />
          </Row>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          Position follows the first (top) language — switch to its tab to move both captions.
        </p>
      )}
    </div>
  );
}
