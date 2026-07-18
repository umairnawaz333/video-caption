'use client';
import {
  findActiveSegment, findActiveWordIndex, positionToCss, styleToCss,
} from '@/lib/captionStyle';
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

  const wordIdx = style.highlight.enabled ? findActiveWordIndex(active, currentTime) : -1;

  return (
    <div style={positionToCss(style)}>
      <span style={styleToCss(style, containerHeight)}>
        {wordIdx === -1
          ? active.text
          : active.words!.map((w, i) => (
              <span key={i} style={i === wordIdx ? { color: style.highlight.color } : undefined}>
                {w.text}
                {i < active.words!.length - 1 ? ' ' : ''}
              </span>
            ))}
      </span>
    </div>
  );
}
