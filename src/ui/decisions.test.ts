import { createWorld } from '../sim/world';
import { advanceTurn } from '../sim/tick';
import { decisionsFor, tryRun, type Decision } from './decisions';
import type { World } from '../sim/types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };
const flat = (ds: Decision[]): Decision[] => ds.flatMap((d) => [d, ...flat(d.sub ?? [])]);

describe('decisions about a person', () => {
  it('every enabled decision, for everyone with a full sheet, runs without error', () => {
    let w = structuredClone(createWorld());
    for (let i = 0; i < 40; i++) w = step(w);
    const people = Object.values(w.characters).filter((c) => c.tier === 'full');
    let ran = 0;
    for (const c of people) {
      for (const d of flat(decisionsFor(w, c.id))) {
        if (d.why || !d.run) continue;
        const r = tryRun(w, d);
        expect(r.error, `${d.key} on ${c.id}`).toBeUndefined();
        ran++;
      }
    }
    expect(ran).toBeGreaterThan(50);
  });

  it('our own get court, missions and their sheet; rivals get intrigue; the dead only the sheet', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const mine = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && c.role === 'Knight')
      ?? Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat && c.seat !== 'highroy')!;
    const groups = new Set(decisionsFor(w, mine.id).map((d) => d.group));
    expect(groups.has('Court')).toBe(true);
    expect(groups.has('Missions')).toBe(true);
    expect(groups.has('Sheet')).toBe(true);
    const theirs = Object.values(w.characters).find((c) => c.alive && c.houseId !== P && c.tier === 'full')!;
    const t = decisionsFor(w, theirs.id);
    expect(t.some((d) => d.key === 'inv')).toBe(true);
    expect(t.some((d) => d.group === 'Court')).toBe(false);
    mine.alive = false;
    expect(decisionsFor(w, mine.id).every((d) => d.group === 'Sheet')).toBe(true);
  });

  it('calling someone before the court is once a Phase, and says why after', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const a = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy');
    const d = decisionsFor(w, a[0]!.id).find((x) => x.key === 'audience')!;
    expect(d.why).toBeFalsy();
    const next = d.run!(w);
    expect(decisionsFor(next, a[1]!.id).find((x) => x.key === 'audience')!.why).toBe('Once a Phase');
  });
});
