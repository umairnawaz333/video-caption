import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trlsvc-'));

  function makeService(opts: { langs?: string; translate?: string }): TranslationService {
    const svc = new TranslationService();
    if (opts.langs) (svc as any).langsScript = opts.langs;
    if (opts.translate) (svc as any).translateScript = opts.translate;
    return svc;
  }

  it('lists languages and caches the result', async () => {
    const fake = path.join(dir, 'langs-ok.py');
    fs.writeFileSync(fake, `import json,sys,os
marker = ${JSON.stringify(JSON.stringify(path.join(dir, 'calls.txt')))}
with open(json.loads(marker), 'a') as f: f.write('x')
json.dump([{"code":"ur","name":"Urdu","installed":False}], sys.stdout)`);
    const svc = makeService({ langs: fake });
    const first = await svc.listLanguages();
    const second = await svc.listLanguages();
    expect(first).toEqual([{ code: 'ur', name: 'Urdu', installed: false }]);
    expect(second).toEqual(first);
    expect(fs.readFileSync(path.join(dir, 'calls.txt'), 'utf8')).toBe('x'); // one spawn only
  });

  it('translates texts and reports status lines', async () => {
    const fake = path.join(dir, 'translate-ok.py');
    fs.writeFileSync(fake, `import json,sys
print("STATUS downloading", file=sys.stderr, flush=True)
print("some random warning", file=sys.stderr, flush=True)
print("STATUS translating", file=sys.stderr, flush=True)
data = json.load(sys.stdin)
json.dump({"translations": ["UR:" + t for t in data["texts"]]}, sys.stdout)`);
    const seen: string[] = [];
    const result = await makeService({ translate: fake }).translate(['a', 'b'], 'ur', (s) => seen.push(s));
    expect(result).toEqual(['UR:a', 'UR:b']);
    expect(seen).toEqual(['downloading', 'translating']);
  });

  it('rejects with stderr on failure', async () => {
    const fake = path.join(dir, 'translate-bad.py');
    fs.writeFileSync(fake, `import sys
print("no such package", file=sys.stderr); sys.exit(3)`);
    await expect(makeService({ translate: fake }).translate(['a'], 'xx')).rejects.toThrow(/no such package/);
  });

  it('rejects on mismatched result length', async () => {
    const fake = path.join(dir, 'translate-short.py');
    fs.writeFileSync(fake, `import json,sys
json.load(sys.stdin)
json.dump({"translations": ["only one"]}, sys.stdout)`);
    await expect(makeService({ translate: fake }).translate(['a', 'b'], 'ur')).rejects.toThrow(/mismatched/);
  });
});
