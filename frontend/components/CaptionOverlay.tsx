'use client';
import { findActiveSegment, positionToCss, styleToCss } from '@/lib/captionStyle';
import type { CaptionStyle, Segment } from '@/lib/types';

export default function CaptionOverlay({
  segments, style, currentTime, containerHeight,
}: {
  segments: Segment[];
  style: CaptionStyle;
  currentTime: number;
  containerHeight: number;
}) {
  const active = findActiveSegment(segments, currentTime);
  if (!active || containerHeight === 0) return null;
  return (
    <div style={positionToCss(style)}>
      <span style={styleToCss(style, containerHeight)}>{active.text}</span>
    </div>
  );
}
