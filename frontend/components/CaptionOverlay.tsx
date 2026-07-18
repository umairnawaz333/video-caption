'use client';
import {
  findActiveSegment, findActiveWordIndex, positionToCss, styleToCss, wordBoxCss,
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

  const hasWords = !!active.words && active.words.length > 0;
  // wordLagSec delays the highlight to compensate for whisper's early word starts
  const wordIdx = hasWords ? findActiveWordIndex(active, currentTime - style.wordLagSec) : -1;
  const bubble = styleToCss(style, containerHeight);

  // one word at a time, big
  if (style.singleWord && wordIdx !== -1) {
    return (
      <div style={positionToCss(style)}>
        <span style={bubble}>{active.words![wordIdx].text}</span>
      </div>
    );
  }

  const highlightIdx = style.highlight.enabled ? wordIdx : -1;

  return (
    <div style={positionToCss(style)}>
      <span style={bubble}>
        {highlightIdx === -1
          ? active.text
          : active.words!.map((w, i) => (
              <span key={i}>
                <span
                  style={
                    i === highlightIdx
                      ? style.highlight.mode === 'box'
                        ? wordBoxCss(style, containerHeight)
                        : { color: style.highlight.color }
                      : undefined
                  }
                >
                  {w.text}
                </span>
                {i < active.words!.length - 1 ? ' ' : ''}
              </span>
            ))}
      </span>
    </div>
  );
}
