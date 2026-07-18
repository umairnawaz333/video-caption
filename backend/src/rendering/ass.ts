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

export function generateAss(
  segments: Segment[],
  style: CaptionStyle,
  video: { width: number; height: number },
): string {
  const fontSize = Math.round((style.fontSizePct / 100) * video.height);
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
  const marginV =
    style.position === 'middle'
      ? 0
      : Math.max(0, Math.round((style.verticalOffsetPct / 100) * video.height));

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
    `Style: Caption,${style.fontFamily},${fontSize},${primary},${primary},${outlineColor},${outlineColor},${style.bold ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${outlineWidth},0,${ALIGN[style.position]},60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // inline override tags use &HBBGGRR& (no alpha byte)
  const hl6 = hexToAssColor(style.highlight.color).slice(4);
  const primary6 = primary.slice(4);
  const outline6 = outlineColor.slice(4);
  const highlightTag = `{\\1c&H${hl6}&}`;
  const primaryTag = `{\\1c&H${primary6}&}`;
  // box mode: a thick rounded stroke behind the active word reads as a pill
  const boxWidth = Math.max(4, Math.round(fontSize * 0.22));
  const boxOnTag = `{\\bord${boxWidth}\\3c&H${hl6}&}`;
  const boxOffTag = `{\\bord${outlineWidth}\\3c&H${outline6}&}`;

  const tx = (t: string) => escapeAssText(style.uppercase ? t.toUpperCase() : t);
  const event = (start: number, end: number, text: string) =>
    `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Caption,,0,0,0,,${text}`;
  // word events tile the chunk without gaps; inner boundaries shift by
  // wordLagSec (whisper marks word starts slightly early), chunk edges stay put
  const lagged = (s: Segment, i: number) =>
    Math.min(Math.max(s.words![i].start + style.wordLagSec, s.start), s.end);
  const wordSpan = (s: Segment, i: number): [number, number] => [
    i === 0 ? s.start : lagged(s, i),
    i === s.words!.length - 1 ? s.end : lagged(s, i + 1),
  ];

  const events = segments.flatMap((s) => {
    const hasWords = !!s.words && s.words.length > 0;

    // one word at a time, big
    if (style.singleWord && hasWords) {
      return s.words!.map((w, i) => event(...wordSpan(s, i), tx(w.text)));
    }

    if (!style.highlight.enabled || !hasWords) return [event(s.start, s.end, tx(s.text))];

    // karaoke: one event per word; the active word is tinted ('color') or
    // wrapped in a thick colored stroke ('box'), the rest stay unchanged
    return s.words!.map((_, i) => {
      const text = s.words!
        .map((w, j) => {
          if (j !== i) return tx(w.text);
          return style.highlight.mode === 'box'
            ? `${boxOnTag}${tx(w.text)}${boxOffTag}`
            : `${highlightTag}${tx(w.text)}${primaryTag}`;
        })
        .join(' ');
      return event(...wordSpan(s, i), text);
    });
  });

  return [...header, ...events, ''].join('\n');
}
