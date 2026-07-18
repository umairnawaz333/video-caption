import { randomUUID } from 'crypto';
import { Segment, Word } from '../jobs/types';

/** Segment shape as produced by the whisper sidecar (no id yet). */
export interface RawSegment {
  start: number;
  end: number;
  text: string;
  words?: Word[];
}

const MAX_WORDS = 4;
const MAX_CHARS = 28;
const MAX_GAP_S = 0.8; // silence longer than this starts a new caption

/**
 * Split whisper sentences into short one-line caption chunks (3-4 words)
 * that flip quickly as speech flows. Segments without word timings pass
 * through unchanged.
 */
export function chunkSegments(raw: RawSegment[]): Segment[] {
  const out: Segment[] = [];

  for (const seg of raw) {
    if (!seg.words || seg.words.length === 0) {
      out.push({ id: randomUUID(), start: seg.start, end: seg.end, text: seg.text });
      continue;
    }

    let current: Word[] = [];
    const flush = () => {
      if (current.length === 0) return;
      out.push({
        id: randomUUID(),
        start: current[0].start,
        end: current[current.length - 1].end,
        text: current.map((w) => w.text).join(' '),
        words: current,
      });
      current = [];
    };

    for (const word of seg.words) {
      const prev = current[current.length - 1];
      const joinedLength =
        current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
      if (
        current.length >= MAX_WORDS ||
        (prev && word.start - prev.end > MAX_GAP_S) ||
        (current.length > 0 && joinedLength > MAX_CHARS)
      ) {
        flush();
      }
      current.push(word);
    }
    flush();
  }

  return out;
}
