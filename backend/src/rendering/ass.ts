import { CaptionStyle, Segment } from '../jobs/types';

/** '#RRGGBB' + transparency (0 = opaque, 1 = invisible) -> ASS '&HAABBGGRR' */
export function hexToAssColor(hex: string, transparency = 0): string {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  const a = Math.round(transparency * 255).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

export function formatAssTime(sec: number): string {
  const total = Math.round(sec * 100); // centiseconds, avoids float drift
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const h = Math.floor(total / 360000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(s)}.${p(cs)}`;
}

export function escapeAssText(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

const ALIGN: Record<CaptionStyle['position'], number> = { bottom: 2, middle: 5, top: 8 };

const styleName = (trackIdx: number) => (trackIdx === 0 ? 'Caption' : `Caption${trackIdx + 1}`);

/** Arabic/Hebrew/Syriac + presentation forms: text that libass would scramble if split. */
export const hasRtlText = (text: string) => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(text);

/** One caption track to render; order in the array = line order, top first. */
export interface AssTrack {
  segments: Segment[];
  style: CaptionStyle; // per-track appearance (font, colors, box, highlight, ...)
  fontFamily?: string; // per-script override (e.g. Noto Nastaliq Urdu); wins over style font
  fontScale?: number;  // size multiplier for small-glyph scripts (default 1)
  rtl?: boolean;       // right-to-left script: never karaoke-split this track
}

export function generateAss(
  segments: Segment[],
  style: CaptionStyle,
  video: { width: number; height: number },
): string {
  return generateAssTracks([{ segments, style }], video);
}

/** Per-track appearance derived from that track's own CaptionStyle. */
function trackRender(t: AssTrack, video: { height: number }) {
  const style = t.style;
  const fontSize = Math.round((style.fontSizePct / 100) * video.height * (t.fontScale ?? 1));
  const bg = style.background;
  const borderStyle = bg.enabled ? 3 : 1;
  // BorderStyle=3 draws the box with OutlineColour; Outline acts as box padding.
  const outlineWidth = bg.enabled
    ? Math.max(2, Math.round(fontSize * 0.18))
    : style.outline.enabled
      ? Math.max(1, Math.round(fontSize * 0.07))
      : 0;
  const outlineColor = bg.enabled
    ? hexToAssColor(bg.color, 1 - bg.opacity)
    : hexToAssColor(style.outline.color);
  const primary = hexToAssColor(style.textColor);
  const tx = (text: string) => escapeAssText(style.uppercase ? text.toUpperCase() : text);
  return { style, fontSize, borderStyle, outlineWidth, outlineColor, primary, tx };
}

export function generateAssTracks(
  tracks: AssTrack[],
  video: { width: number; height: number },
): string {
  const renders = tracks.map((t) => trackRender(t, video));
  // the first (top) track's style anchors the whole stacked block
  const anchor = tracks[0].style;
  const marginV =
    anchor.position === 'middle'
      ? 0
      : Math.max(0, Math.round((anchor.verticalOffsetPct / 100) * video.height));

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${video.width}`,
    `PlayResY: ${video.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...tracks.map((t, i) => {
      const r = renders[i];
      return `Style: ${styleName(i)},${t.fontFamily ?? r.style.fontFamily},${r.fontSize},${r.primary},${r.primary},${r.outlineColor},${r.outlineColor},${r.style.bold ? -1 : 0},0,0,0,100,100,0,0,${r.borderStyle},${r.outlineWidth},0,${ALIGN[anchor.position]},60,60,${marginV},1`;
    }),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // the "driver" track carries word timings and drives event timing; other
  // tracks (translations, which share chunk timings) render as static lines.
  // Prefer an LTR track with words — RTL lines cannot be karaoke-split.
  const multi = tracks.length > 1;
  const hasWords = (t: AssTrack) => t.segments.some((s) => s.words && s.words.length > 0);
  let driverIdx = tracks.findIndex((t) => !t.rtl && hasWords(t));
  if (driverIdx === -1) driverIdx = tracks.findIndex(hasWords);
  if (driverIdx === -1) driverIdx = 0;
  const driver = tracks[driverIdx];
  const dr = renders[driverIdx];
  // RTL drivers may single-word (one word per event is order-safe) but never word-split
  const canSplitWords = !driver.rtl;
  const prefix = (ti: number) => (multi ? `{\\r${styleName(ti)}}` : '');

  // karaoke tags come from the driver track's own style (&HBBGGRR&, no alpha)
  const hl6 = hexToAssColor(dr.style.highlight.color).slice(4);
  const highlightTag = `{\\1c&H${hl6}&}`;
  const primaryTag = `{\\1c&H${dr.primary.slice(4)}&}`;
  // box mode: a thick rounded stroke behind the active word reads as a pill
  const boxWidth = Math.max(4, Math.round(dr.fontSize * 0.22));
  const boxOnTag = `{\\bord${boxWidth}\\3c&H${hl6}&}`;
  const boxOffTag = `{\\bord${dr.outlineWidth}\\3c&H${dr.outlineColor.slice(4)}&}`;

  const event = (start: number, end: number, text: string) =>
    `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Caption,,0,0,0,,${text}`;
  // word events tile the chunk without gaps; inner boundaries shift by
  // wordLagSec (whisper marks word starts slightly early), chunk edges stay put
  const lagged = (s: Segment, i: number) =>
    Math.min(Math.max(s.words![i].start + dr.style.wordLagSec, s.start), s.end);
  const wordSpan = (s: Segment, i: number): [number, number] => [
    i === 0 ? s.start : lagged(s, i),
    i === s.words!.length - 1 ? s.end : lagged(s, i + 1),
  ];

  // full event text for chunk si, with the driver track's line swapped in
  const assemble = (si: number, driverLine: string): string =>
    tracks
      .map((t, ti) => {
        if (ti === driverIdx) return prefix(ti) + driverLine;
        const seg = t.segments[si];
        return seg ? prefix(ti) + renders[ti].tx(seg.text) : null;
      })
      .filter((l): l is string => l !== null)
      .join('\\N');

  const events = driver.segments.flatMap((s, si) => {
    const segWords = !!s.words && s.words.length > 0;

    // one word at a time, big (safe for RTL: one word per event)
    if (dr.style.singleWord && segWords) {
      return s.words!.map((w, i) => event(...wordSpan(s, i), assemble(si, dr.tx(w.text))));
    }

    // per-segment content guard: mislabeled tracks can carry RTL text
    if (!dr.style.highlight.enabled || !segWords || !canSplitWords || hasRtlText(s.text)) {
      return [event(s.start, s.end, assemble(si, dr.tx(s.text)))];
    }

    // karaoke: one event per word; the active word is tinted ('color') or
    // wrapped in a thick colored stroke ('box'), the rest stay unchanged
    return s.words!.map((_, i) => {
      const line = s.words!
        .map((w, j) => {
          if (j !== i) return dr.tx(w.text);
          return dr.style.highlight.mode === 'box'
            ? `${boxOnTag}${dr.tx(w.text)}${boxOffTag}`
            : `${highlightTag}${dr.tx(w.text)}${primaryTag}`;
        })
        .join(' ');
      return event(...wordSpan(s, i), assemble(si, line));
    });
  });

  return [...header, ...events, ''].join('\n');
}
