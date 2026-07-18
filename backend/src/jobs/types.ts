export type JobStatus =
  | 'uploading' | 'extracting' | 'transcribing' | 'ready'
  | 'rendering' | 'done' | 'error';

export interface Word { start: number; end: number; text: string }
export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: Word[];               // word-level timings; absent after manual text edits
}
export interface CaptionTrack { language: string; segments: Segment[] }
export interface VideoMeta { filename: string; duration: number; width: number; height: number }

export interface CaptionStyle {
  preset?: string;
  fontFamily: string;
  fontSizePct: number;          // % of video height
  textColor: string;            // '#RRGGBB'
  uppercase: boolean;           // render text in ALL CAPS
  bold: boolean;                // heavier text weight
  singleWord: boolean;          // show one word at a time (needs word timings)
  background: { enabled: boolean; color: string; opacity: number; rounded: boolean };
  outline: { enabled: boolean; color: string };
  // karaoke: 'color' tints the spoken word, 'box' draws a pill behind it
  highlight: { enabled: boolean; color: string; mode: 'color' | 'box' };
  // shifts word highlight/single-word timing (seconds); + = later, - = earlier.
  // Whisper marks word starts slightly early, so a small positive lag syncs better.
  wordLagSec: number;
  position: 'top' | 'middle' | 'bottom';
  verticalOffsetPct: number;    // % of video height from the edge
}

export interface Job {
  id: string;
  status: JobStatus;
  error?: string;
  progress?: number;            // 0-100 within the current long-running step
  video?: VideoMeta;
  tracks: CaptionTrack[];       // v1: exactly one, language 'en'
  createdAt: number;
  dir: string;                  // tmp/<id> — never sent to the client
}
