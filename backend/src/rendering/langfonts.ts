/**
 * Burn-time render overrides for scripts the user-selectable Latin fonts
 * can't display. Fonts live in fonts/ (passed to FFmpeg via fontsdir).
 * `scale` compensates for scripts whose glyphs run small at a given point
 * size (Nastaliq especially). Languages not listed use the style font;
 * libass falls back to system fonts for missing glyphs.
 */
export const LANG_RENDER: Record<string, { font: string; scale?: number }> = {
  ur: { font: 'Noto Nastaliq Urdu', scale: 1.3 },
  ar: { font: 'Noto Naskh Arabic', scale: 1.1 },
  fa: { font: 'Noto Naskh Arabic', scale: 1.1 },
  hi: { font: 'Noto Sans Devanagari', scale: 1.1 },
};

/**
 * Right-to-left languages. Karaoke word-splitting is disabled for these at
 * burn time: libass lays out tag-separated runs in visual order, which
 * scrambles RTL word order when override tags are inserted mid-line.
 */
export const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
