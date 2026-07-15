import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TranscriptionService } from './transcription.service';

describe('TranscriptionService', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trsvc-'));

  function makeService(script: string): TranscriptionService {
    const svc = new TranscriptionService();
    (svc as any).script = script; // test seam; real value comes from config
    return svc;
  }

  it('parses sidecar JSON output', async () => {
    const fake = path.join(dir, 'ok.py');
    fs.writeFileSync(fake, `import json,sys
json.dump({"language":"en","segments":[{"start":0.0,"end":1.0,"text":"hi"}]}, sys.stdout)`);
    const result = await makeService(fake).transcribe('/any/audio.wav');
    expect(result.language).toBe('en');
    expect(result.segments).toEqual([{ start: 0, end: 1, text: 'hi' }]);
  });

  it('rejects with stderr on sidecar failure', async () => {
    const fake = path.join(dir, 'bad.py');
    fs.writeFileSync(fake, `import sys
print("model exploded", file=sys.stderr); sys.exit(3)`);
    await expect(makeService(fake).transcribe('/any/audio.wav')).rejects.toThrow(/model exploded/);
  });

  it('rejects on invalid JSON', async () => {
    const fake = path.join(dir, 'garbage.py');
    fs.writeFileSync(fake, `print("not json")`);
    await expect(makeService(fake).transcribe('/any/audio.wav')).rejects.toThrow(/invalid JSON/i);
  });
});
