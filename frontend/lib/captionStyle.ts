import type { CSSProperties } from 'react';
import type { CaptionStyle, Segment } from './types';

export function hexWithOpacity(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function outlineShadow(color: string): string {
  return `-2px -2px 0 ${color}, 2px -2px 0 ${color}, -2px 2px 0 ${color}, 2px 2px 0 ${color}`;
}

/** Text styling for the caption bubble. containerHeight = rendered video height in px. */
export function styleToCss(style: CaptionStyle, containerHeight: number): CSSProperties {
  const fontSize = (style.fontSizePct / 100) * containerHeight;
  const bg = style.background;
  return {
    fontFamily: `'${style.fontFamily}', sans-serif`,
    fontSize,
    lineHeight: 1.25,
    color: style.textColor,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    padding: bg.enabled ? `${fontSize * 0.18}px ${fontSize * 0.45}px` : 0,
    borderRadius: bg.enabled && bg.rounded ? fontSize * 0.35 : 0,
    backgroundColor: bg.enabled ? hexWithOpacity(bg.color, bg.opacity) : 'transparent',
    textShadow: !bg.enabled && style.outline.enabled ? outlineShadow(style.outline.color) : 'none',
  };
}

/** Absolute positioning for the caption wrapper inside the video container. */
export function positionToCss(style: CaptionStyle): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute', left: 0, right: 0,
    display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    padding: '0 5%',
  };
  if (style.position === 'middle') return { ...base, top: '50%', transform: 'translateY(-50%)' };
  if (style.position === 'top') return { ...base, top: `${style.verticalOffsetPct}%` };
  return { ...base, bottom: `${style.verticalOffsetPct}%` };
}

export function findActiveSegment(segments: Segment[], time: number): Segment | null {
  return segments.find((s) => time >= s.start && time < s.end) ?? null;
}

/**
 * Index of the word being spoken at `time`. During inter-word silence the
 * previous word stays lit (matches the burned ASS output, which tiles word
 * events without gaps). -1 when the segment has no word timings.
 */
export function findActiveWordIndex(segment: Segment, time: number): number {
  const words = segment.words;
  if (!words || words.length === 0) return -1;
  let active = 0;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start) active = i;
  }
  return active;
}
