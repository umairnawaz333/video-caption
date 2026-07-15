import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { FfmpegService } from './ffmpeg.service';

describe('FfmpegService (requires ffmpeg)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffsvc-'));
  const input = path.join(dir, 'in.mp4');
  const service = new FfmpegService();

  beforeAll(() => {
    // 2s black 320x240 video with a 440Hz tone
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=320x240:d=2 -f lavfi -i sine=frequency=440:duration=2 ` +
      `-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${input}"`,
      { stdio: 'ignore' },
    );
  }, 30_000);

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('probes dimensions and duration', async () => {
    const meta = await service.probe(input);
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(240);
    expect(meta.duration).toBeGreaterThan(1.5);
  });

  it('extracts 16kHz mono wav', async () => {
    const wav = path.join(dir, 'a.wav');
    await service.extractAudio(input, wav);
    expect(fs.existsSync(wav)).toBe(true);
    expect(fs.statSync(wav).size).toBeGreaterThan(10_000);
  });

  it('burns an ass file into the video', async () => {
    const ass = path.join(dir, 'c.ass');
    fs.writeFileSync(ass, [
      '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 320', 'PlayResY: 240', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Caption,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1',
      '', '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:00.00,0:00:02.00,Caption,,0,0,0,,Hello',
    ].join('\n'));
    const out = path.join(dir, 'out.mp4');
    await service.burnSubtitles(input, ass, path.resolve('..', 'fonts'), out);
    expect(fs.statSync(out).size).toBeGreaterThan(1000);
  }, 30_000);

  it('rejects with stderr tail on bad input', async () => {
    await expect(service.probe(path.join(dir, 'missing.mp4'))).rejects.toThrow();
  });
});
