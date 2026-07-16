'use client';
import type { Segment } from '@/lib/types';

export default function TranscriptEditor(_props: {
  segments: Segment[]; onChange: (s: Segment[]) => void;
  onSeek: (t: number) => void; currentTime: number;
}) {
  return null;
}
