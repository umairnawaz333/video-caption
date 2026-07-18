import { describe, expect, it } from 'vitest';
import {
  findActiveSegment, findActiveWordIndex, hexWithOpacity, positionToCss, styleToCss,
} from './captionStyle';
import { PRESETS, FONTS } from './presets';
import type { CaptionStyle, Segment } from './types';

const style: CaptionStyle = {
  fontFamily: 'Arial', fontSizePct: 5, textColor: '#FFFFFF',
  uppercase: false, bold: false, singleWord: false,
  background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
  outline: { enabled: false, color: '#000000' },
  highlight: { enabled: false, color: '#FDE047', mode: 'color' },
  wordLagSec: 0,
  position: 'bottom', verticalOffsetPct: 5,
};

describe('hexWithOpacity', () => {
  it('converts to rgba', () => {
    expect(hexWithOpacity('#FF8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)');
  });
});

describe('styleToCss', () => {
  it('maps size, color, background, radius', () => {
    const css = styleToCss(style, 400); // 5% of 400 = 20px
    expect(css.fontSize).toBe(20);
    expect(css.color).toBe('#FFFFFF');
    expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0.6)');
    expect(css.borderRadius).toBeGreaterThan(0);
  });
  it('uses text-shadow outline when background off', () => {
    const s = { ...style, background: { ...style.background, enabled: false }, outline: { enabled: true, color: '#000000' } };
    const css = styleToCss(s, 400);
    expect(css.backgroundColor).toBe('transparent');
    expect(css.textShadow).toContain('#000000');
  });
});

describe('positionToCss', () => {
  it('anchors bottom with offset', () => {
    expect(positionToCss(style)).toMatchObject({ bottom: '5%' });
  });
  it('centers for middle', () => {
    expect(positionToCss({ ...style, position: 'middle' }).top).toBe('50%');
  });
});

describe('findActiveSegment', () => {
  const segs: Segment[] = [
    { id: 'a', start: 0, end: 1, text: 'one' },
    { id: 'b', start: 1.5, end: 3, text: 'two' },
  ];
  it('finds the active segment', () => {
    expect(findActiveSegment(segs, 0.5)?.id).toBe('a');
    expect(findActiveSegment(segs, 2)?.id).toBe('b');
  });
  it('returns null in gaps and past the end', () => {
    expect(findActiveSegment(segs, 1.2)).toBeNull();
    expect(findActiveSegment(segs, 99)).toBeNull();
  });
});

describe('findActiveWordIndex', () => {
  const seg: Segment = {
    id: 'a', start: 0, end: 1.6, text: 'hello brave world',
    words: [
      { start: 0, end: 0.5, text: 'hello' },
      { start: 0.5, end: 1.0, text: 'brave' },
      { start: 1.1, end: 1.6, text: 'world' },
    ],
  };
  it('finds the spoken word', () => {
    expect(findActiveWordIndex(seg, 0.2)).toBe(0);
    expect(findActiveWordIndex(seg, 0.7)).toBe(1);
    expect(findActiveWordIndex(seg, 1.5)).toBe(2);
  });
  it('keeps the previous word lit during inter-word gaps', () => {
    expect(findActiveWordIndex(seg, 1.05)).toBe(1);
  });
  it('returns -1 for segments without words', () => {
    expect(findActiveWordIndex({ id: 'b', start: 0, end: 1, text: 'x' }, 0.5)).toBe(-1);
  });
});

describe('presets', () => {
  it('has 9 presets, all fonts in FONTS list, all with valid config', () => {
    expect(PRESETS).toHaveLength(9);
    for (const p of PRESETS) {
      expect(FONTS).toContain(p.style.fontFamily);
      expect(p.style.fontSizePct).toBeGreaterThan(0);
      expect(typeof p.style.uppercase).toBe('boolean');
      expect(typeof p.style.bold).toBe('boolean');
      expect(typeof p.style.singleWord).toBe('boolean');
      expect(typeof p.style.highlight.enabled).toBe('boolean');
      expect(['color', 'box']).toContain(p.style.highlight.mode);
      expect(p.style.highlight.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
  it('screenshot presets have their signature traits', () => {
    expect(PRESETS.find((p) => p.id === 'pop-word')!.style.singleWord).toBe(true);
    expect(PRESETS.find((p) => p.id === 'pop-word')!.style.uppercase).toBe(true);
    expect(PRESETS.find((p) => p.id === 'serif')!.style.highlight.mode).toBe('box');
    expect(PRESETS.find((p) => p.id === 'impact')!.style.uppercase).toBe(true);
    expect(PRESETS.find((p) => p.id === 'karaoke')!.style.highlight.enabled).toBe(true);
    expect(PRESETS.find((p) => p.id === 'bold-reels')!.style.highlight.enabled).toBe(true);
  });
});

describe('styleToCss expansion', () => {
  it('maps uppercase and bold', () => {
    const css = styleToCss({ ...style, uppercase: true, bold: true }, 400);
    expect(css.textTransform).toBe('uppercase');
    expect(css.fontWeight).toBe(700);
  });
});
