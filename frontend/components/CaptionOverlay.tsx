'use client';
import {
  findActiveSegment, findActiveWordIndex, positionToCss, styleToCss, wordBoxCss,
} from '@/lib/captionStyle';
import { hasRtlText, langLineCss, RTL_LANGS } from '@/lib/languages';
import type { CaptionStyle, CaptionTrack, Segment } from '@/lib/types';

function WordLine({
  segment, style, currentTime, containerHeight, rtl,
}: {
  segment: Segment;
  style: CaptionStyle;
  currentTime: number;
  containerHeight: number;
  rtl: boolean;
}) {
  const hasWords = !!segment.words && segment.words.length > 0;
  // wordLagSec delays the highlight to compensate for whisper's early word starts
  const wordIdx = hasWords ? findActiveWordIndex(segment, currentTime - style.wordLagSec) : -1;

  // one word at a time, big (safe for RTL: one word per tick)
  if (style.singleWord && wordIdx !== -1) {
    return <>{segment.words![wordIdx].text}</>;
  }

  // no word-highlight on RTL lines: the burned export can't karaoke-split
  // right-to-left text, so the preview matches by rendering it whole
  const highlightIdx =
    style.highlight.enabled && !rtl && !hasRtlText(segment.text) ? wordIdx : -1;
  if (highlightIdx === -1) return <>{segment.text}</>;

  return (
    <>
      {segment.words!.map((w, i) => (
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
          {i < segment.words!.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/** Renders 1-2 caption tracks stacked at the styled position. */
export default function CaptionOverlay({
  tracks, style, currentTime, containerHeight,
}: {
  tracks: CaptionTrack[];             // display order: first = top line
  style: CaptionStyle;
  currentTime: number;
  containerHeight: number;
}) {
  if (containerHeight === 0) return null;
  const fontSize = (style.fontSizePct / 100) * containerHeight;

  const lines = tracks
    .map((track) => ({
      language: track.language,
      segment: findActiveSegment(track.segments, currentTime),
    }))
    .filter((l): l is { language: string; segment: Segment } => l.segment !== null);
  if (lines.length === 0) return null;

  return (
    <div style={{ ...positionToCss(style), flexDirection: 'column', alignItems: 'center', gap: fontSize * 0.25 }}>
      {lines.map(({ language, segment }) => (
        <span
          key={language}
          style={{ ...styleToCss(style, containerHeight), ...langLineCss(language, fontSize) }}
        >
          <WordLine
            segment={segment}
            style={style}
            currentTime={currentTime}
            containerHeight={containerHeight}
            rtl={RTL_LANGS.has(language)}
          />
        </span>
      ))}
    </div>
  );
}
