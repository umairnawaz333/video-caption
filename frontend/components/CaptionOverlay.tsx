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

/** Renders 1-2 caption tracks stacked, each styled by its own language's style. */
export default function CaptionOverlay({
  tracks, styles, currentTime, containerHeight,
}: {
  tracks: CaptionTrack[];                    // display order: first = top line
  styles: Record<string, CaptionStyle>;      // per-language styles
  currentTime: number;
  containerHeight: number;
}) {
  if (containerHeight === 0 || tracks.length === 0) return null;
  const anchorStyle = styles[tracks[0].language];
  if (!anchorStyle) return null;
  const anchorFontSize = (anchorStyle.fontSizePct / 100) * containerHeight;

  const lines = tracks
    .map((track) => ({
      language: track.language,
      style: styles[track.language] ?? anchorStyle,
      segment: findActiveSegment(track.segments, currentTime),
    }))
    .filter((l): l is { language: string; style: CaptionStyle; segment: Segment } => l.segment !== null);
  if (lines.length === 0) return null;

  return (
    <div
      style={{
        // the first (top) track's style anchors the stacked block
        ...positionToCss(anchorStyle),
        flexDirection: 'column',
        alignItems: 'center',
        gap: anchorFontSize * 0.25,
      }}
    >
      {lines.map(({ language, style, segment }) => (
        <span
          key={language}
          style={{
            ...styleToCss(style, containerHeight),
            ...langLineCss(language, (style.fontSizePct / 100) * containerHeight),
          }}
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
