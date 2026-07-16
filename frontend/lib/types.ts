export type JobStatus =
  | 'uploading' | 'extracting' | 'transcribing' | 'ready'
  | 'rendering' | 'done' | 'error';

export interface Segment { id: string; start: number; end: number; text: string }
export interface CaptionTrack { language: string; segments: Segment[] }
export interface VideoMeta { filename: string; duration: number; width: number; height: number }

export interface CaptionStyle {
  preset?: string;
  fontFamily: string;
  fontSizePct: number;
  textColor: string;
  background: { enabled: boolean; color: string; opacity: number; rounded: boolean };
  outline: { enabled: boolean; color: string };
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
