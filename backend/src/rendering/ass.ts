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
    `Style: Caption,${style.fontFamily},${fontSize},${primary},${primary},${outlineColor},${outlineColor},0,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},0,${ALIGN[style.position]},60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = segments.map(
    (s) =>
      `Dialogue: 0,${formatAssTime(s.start)},${formatAssTime(s.end)},Caption,,0,0,0,,${escapeAssText(s.text)}`,
  );

  return [...header, ...events, ''].join('\n');
}
