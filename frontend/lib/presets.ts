import type { CaptionStyle } from './types';

export const FONTS = ['Arial', 'Georgia', 'Impact', 'Anton', 'Bangers'];

function make(partial: Partial<CaptionStyle> & { preset: string }): CaptionStyle {
  return {
    fontFamily: 'Arial', fontSizePct: 4.5, textColor: '#FFFFFF',
    background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
    outline: { enabled: false, color: '#000000' },
    highlight: { enabled: false, color: '#FDE047' },
    position: 'bottom', verticalOffsetPct: 6,
    ...partial,
  };
}

export const PRESETS: { id: string; name: string; style: CaptionStyle }[] = [
  { id: 'clean', name: 'Clean', style: make({ preset: 'clean' }) },
  {
    id: 'podcast', name: 'Podcast',
    style: make({
      preset: 'podcast', fontFamily: 'Georgia', fontSizePct: 4,
      background: { enabled: true, color: '#1E293B', opacity: 0.75, rounded: true },
      verticalOffsetPct: 8,
    }),
  },
  {
    id: 'bold-reels', name: 'Bold Reels',
    style: make({
      preset: 'bold-reels', fontFamily: 'Anton', fontSizePct: 6.5,
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: true, color: '#000000' },
      highlight: { enabled: true, color: '#FDE047' },
      verticalOffsetPct: 18,
    }),
  },
  {
    id: 'minimal', name: 'Minimal',
    style: make({
      preset: 'minimal', fontSizePct: 3.5,
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: false },
      outline: { enabled: true, color: '#000000' },
      verticalOffsetPct: 5,
    }),
  },
  {
    id: 'karaoke', name: 'Karaoke',
    style: make({
      preset: 'karaoke', fontFamily: 'Bangers', fontSizePct: 6, textColor: '#FFFFFF',
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: true, color: '#000000' },
      highlight: { enabled: true, color: '#FFD700' },
      verticalOffsetPct: 12,
    }),
  },
];
