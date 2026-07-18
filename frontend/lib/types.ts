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
  fontSizePct: number;
  textColor: string;
  background: { enabled: boolean; color: string; opacity: number; rounded: boolean };
  outline: { enabled: boolean; color: string };
  highlight: { enabled: boolean; color: string };  // karaoke: color the spoken word
  position: 'top' | 'middle' | 'bottom';
  verticalOffsetPct: number;
}

export interface PublicJob {
  id: string;
  status: JobStatus;
  error?: string;
  video?: VideoMeta;
  tracks: CaptionTrack[];
  createdAt: number;
}
