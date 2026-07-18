import type { CaptionStyle } from './types';

export const FONTS = [
  'Arial', 'Georgia', 'Impact', 'Anton', 'Bangers',
  'Poppins', 'Bebas Neue', 'Archivo Black', 'Luckiest Guy', 'Pacifico',
];

function make(partial: Partial<CaptionStyle> & { preset: string }): CaptionStyle {
  return {
    fontFamily: 'Arial', fontSizePct: 4.5, textColor: '#FFFFFF',
    uppercase: false, bold: false, singleWord: false,
    background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
    outline: { enabled: false, color: '#000000' },
    highlight: { enabled: false, color: '#FDE047', mode: 'color' },
    wordLagSec: 0.15,
    position: 'bottom', verticalOffsetPct: 6,
    ...partial,
  };
}

export const PRESETS: { id: string; name: string; style: CaptionStyle }[] = [
  { id: 'clean', name: 'Clean', style: make({ preset: 'clean' }) },
  {
    id: 'pill', name: 'Pill',
    style: make({
      preset: 'pill', fontFamily: 'Poppins', fontSizePct: 4.5, bold: true,
      textColor: '#111111',
      background: { enabled: true, color: '#FFFFFF', opacity: 0.95, rounded: true },
      highlight: { enabled: true, color: '#9CA3AF', mode: 'color' },
      verticalOffsetPct: 10,
    }),
  },
  {
    id: 'pop-word', name: 'Pop Word',
    style: make({
      preset: 'pop-word', fontFamily: 'Poppins', fontSizePct: 5.5,
      uppercase: true, bold: true, singleWord: true,
      background: { enabled: true, color: '#F59E0B', opacity: 1, rounded: true },
      verticalOffsetPct: 14,
    }),
  },
  {
    id: 'impact', name: 'Impact',
    style: make({
      preset: 'impact', fontFamily: 'Archivo Black', fontSizePct: 5.5,
      uppercase: true,
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: true },
      outline: { enabled: true, color: '#000000' },
      highlight: { enabled: true, color: '#A78BFA', mode: 'color' },
      verticalOffsetPct: 14,
    }),
  },
  {
    id: 'serif', name: 'Serif',
    style: make({
      preset: 'serif', fontFamily: 'Georgia', fontSizePct: 4.5, bold: true,
      background: { enabled: false, color: '#000000', opacity: 0.6, rounded: false },
      outline: { enabled: true, color: '#000000' },
      highlight: { enabled: true, color: '#22C55E', mode: 'box' },
      verticalOffsetPct: 12,
    }),
  },
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
      highlight: { enabled: true, color: '#FDE047', mode: 'color' },
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
      highlight: { enabled: true, color: '#FFD700', mode: 'color' },
      verticalOffsetPct: 12,
    }),
  },
];
