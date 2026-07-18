import { chunkSegments, RawSegment } from './chunk';

function words(...list: [number, number, string][]) {
  return list.map(([start, end, text]) => ({ start, end, text }));
}

describe('chunkSegments', () => {
  it('splits a long segment into short word chunks', () => {
    const raw: RawSegment[] = [
      {
        start: 0,
        end: 4,
        text: 'welcome to the caption test of chunking behavior',
        words: words(
          [0, 0.4, 'welcome'], [0.4, 0.7, 'to'], [0.7, 0.9, 'the'], [0.9, 1.4, 'caption'],
          [1.4, 1.9, 'test'], [1.9, 2.2, 'of'], [2.2, 3.0, 'chunking'], [3.0, 4.0, 'behavior'],
        ),
      },
    ];
    const chunks = chunkSegments(raw);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.words!.length).toBeLessThanOrEqual(4);
      expect(c.text.length).toBeLessThanOrEqual(28);
      expect(c.id).toBeDefined();
      // chunk boundaries come from its words
      expect(c.start).toBe(c.words![0].start);
      expect(c.end).toBe(c.words![c.words!.length - 1].end);
    }
    // text is words joined by spaces, in order, covering the whole segment
    expect(chunks.map((c) => c.text).join(' ')).toBe(
      'welcome to the caption test of chunking behavior',
    );
  });

  it('splits on long pauses even below the word limit', () => {
    const raw: RawSegment[] = [
      {
        start: 0,
        end: 5,
        text: 'hi there big pause',
        words: words([0, 0.3, 'hi'], [0.3, 0.6, 'there'], [3.0, 3.4, 'big'], [3.4, 4.0, 'pause']),
      },
    ];
    const chunks = chunkSegments(raw);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe('hi there');
    expect(chunks[1].text).toBe('big pause');
  });

  it('never splits a single long word and keeps it as its own chunk', () => {
    const raw: RawSegment[] = [
      {
        start: 0,
        end: 2,
        text: 'supercalifragilisticexpialidocious yes',
        words: words([0, 1.5, 'supercalifragilisticexpialidocious'], [1.5, 2, 'yes']),
      },
    ];
    const chunks = chunkSegments(raw);
    expect(chunks[0].text).toBe('supercalifragilisticexpialidocious');
    expect(chunks[1].text).toBe('yes');
  });

  it('passes through segments without word timings unchanged (except id)', () => {
    const raw: RawSegment[] = [{ start: 1, end: 2, text: 'no words here' }];
    const chunks = chunkSegments(raw);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ start: 1, end: 2, text: 'no words here' });
    expect(chunks[0].words).toBeUndefined();
  });

  it('gives every chunk a unique id', () => {
    const raw: RawSegment[] = [
      {
        start: 0,
        end: 2,
        text: 'one two three four five six',
        words: words(
          [0, 0.3, 'one'], [0.3, 0.6, 'two'], [0.6, 0.9, 'three'],
          [0.9, 1.2, 'four'], [1.2, 1.5, 'five'], [1.5, 2, 'six'],
        ),
      },
    ];
    const ids = chunkSegments(raw).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
