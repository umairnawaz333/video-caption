import { generateAss, hexToAssColor, formatAssTime, escapeAssText } from './ass';
import { CaptionStyle, Segment } from '../jobs/types';

const baseStyle: CaptionStyle = {
  fontFamily: 'Arial',
  fontSizePct: 5,
  textColor: '#FFFFFF',
  background: { enabled: true, color: '#000000', opacity: 0.6, rounded: true },
  outline: { enabled: false, color: '#000000' },
  position: 'bottom',
  verticalOffsetPct: 5,
};
const segments: Segment[] = [
  { id: '1', start: 0, end: 1.5, text: 'Hello world' },
  { id: '2', start: 61.25, end: 62, text: 'Line {two}\nhere' },
];
const video = { width: 1920, height: 1080 };

describe('hexToAssColor', () => {
  it('converts RGB to &HAABBGGRR', () => {
    expect(hexToAssColor('#FF8800')).toBe('&H000088FF');
    expect(hexToAssColor('#000000', 0.4)).toBe('&H66000000');
  });
});

describe('formatAssTime', () => {
  it('formats h:mm:ss.cc', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
    expect(formatAssTime(61.25)).toBe('0:01:01.25');
    expect(formatAssTime(3599.999)).toBe('1:00:00.00');
  });
});

describe('escapeAssText', () => {
  it('strips braces and converts newlines', () => {
    expect(escapeAssText('a {b}\nc')).toBe('a b\\Nc');
  });
});

describe('generateAss', () => {
  it('emits resolution, style and dialogue lines', () => {
    const ass = generateAss(segments, baseStyle, video);
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');
    // 5% of 1080 = 54px font; background → BorderStyle 3; bottom → alignment 2; offset 5% of 1080 = 54
    expect(ass).toMatch(/Style: Caption,Arial,54,&H00FFFFFF,.*,3,\d+,0,2,60,60,54,1/);
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.50,Caption,,0,0,0,,Hello world');
    expect(ass).toContain('Line two\\Nhere');
  });

  it('uses outline style when background disabled', () => {
    const style: CaptionStyle = {
      ...baseStyle,
      background: { ...baseStyle.background, enabled: false },
      outline: { enabled: true, color: '#112233' },
      position: 'middle',
    };
    const ass = generateAss(segments, style, video);
    expect(ass).toMatch(/,1,\d+,0,5,60,60,0,1/); // BorderStyle 1, align 5 (middle), marginV 0
    expect(ass).toContain('&H00332211'); // outline color BGR
  });
});
