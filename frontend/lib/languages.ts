import type { CSSProperties } from 'react';

/** Right-to-left languages (direction + text alignment in preview/editor). */
export const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);

/** Arabic/Hebrew/Syriac + presentation forms: text the export can't karaoke-split. */
export const hasRtlText = (text: string) => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(text);

/**
 * Preview font + size boost per script, mirroring the backend's burn-time
 * overrides (langfonts.ts) so the preview matches the export.
 */
const LANG_PREVIEW: Record<string, { font: string; scale: number }> = {
  ur: { font: 'Noto Nastaliq Urdu', scale: 1.3 },
  ar: { font: 'Noto Naskh Arabic', scale: 1.1 },
  fa: { font: 'Noto Naskh Arabic', scale: 1.1 },
  hi: { font: 'Noto Sans Devanagari', scale: 1.1 },
};

/** CSS overrides to render one caption line in the right script/direction. */
export function langLineCss(language: string, baseFontSize: number): CSSProperties {
  const info = LANG_PREVIEW[language];
  const css: CSSProperties = {};
  if (info) {
    css.fontFamily = `'${info.font}', sans-serif`;
    css.fontSize = baseFontSize * info.scale;
    css.textTransform = 'none'; // uppercase is a Latin-only concept
  }
  if (RTL_LANGS.has(language)) css.direction = 'rtl';
  return css;
}
