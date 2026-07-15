export type JobStatus =
  | 'uploading' | 'extracting' | 'transcribing' | 'ready'
  | 'rendering' | 'done' | 'error';

export interface Segment { id: string; start: number; end: number; text: string }
export interface CaptionTrack { language: string; segments: Segment[] }
export interface VideoMeta { filename: string; duration: number; width: number; height: number }

export interface CaptionStyle {
  preset?: string;
  fontFamily: string;
  fontSizePct: number;          // % of video height
  textColor: string;            // '#RRGGBB'
  background: { enabled: boolean; color: string; opacity: number; rounded: boolean };
  outline: { enabled: boolean; color: string };
  position: 'top' | 'middle' | 'bottom';
  verticalOffsetPct: number;    // % of video height from the edge
}

export interface Job {
  id: string;
  status: JobStatus;
  error?: string;
  video?: VideoMeta;
  tracks: CaptionTrack[];       // v1: exactly one, language 'en'
  createdAt: number;
  dir: string;                  // tmp/<id> — never sent to the client
}
