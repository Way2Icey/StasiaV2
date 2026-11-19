import { createWorld } from './world';
import { advanceUntil } from './tick';
import { classify, involves, logRecord, trimFeed } from './records';

describe('the record log', () => {
  const world = createWorld();

  it('writes full records with ids and people', () => {
    const w = structuredClone(world);
    const c = Object.values(w.characters)[0]!;
    const r = logRecord(w, { kind: 'world', type: 'fight', severity: 2, text: 'A fight', who: [{ id: c.id, part: 'won' }], effects: ['Dread +1'] });
    expect(r.id).toMatch(/^rec/);
    expect(involves(r, c.id)).toBe(true);
    expect(classify(w, r)).toEqual({ type: 'fight', severity: 2 });
  });

  it('classifies older entries', () => {
    expect(classify(world, { date: world.date, kind: 'time', text: 'Orbit 2 begins.' }).severity).toBe(0);
    expect(classify(world, { date: world.date, kind: 'world', text: 'The corsairs sacked Greyspire.' }).type).toBe('raid');
  });

  it('a long run keeps the log bounded and full of records', () => {
    const w = advanceUntil(world, 400, false).world;
    expect(w.feed.length).toBeLessThanOrEqual(1500);
    expect(w.feed.filter((e) => e.id).length).toBeGreaterThan(5);
    const big = structuredClone(w);
    for (let i = 0; i < 2000; i++) big.feed.push({ date: big.date, kind: 'time', text: 'tick' });
    trimFeed(big);
    expect(big.feed.length).toBeLessThanOrEqual(1500);
    expect(big.feed.filter((e) => e.kind !== 'time').length).toBe(w.feed.filter((e) => e.kind !== 'time').length);
  });
});
