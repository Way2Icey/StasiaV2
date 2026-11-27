import { createWorld } from './world';
import { advanceTurn } from './tick';
import { industryOf, learningOf } from './output';
import { computeRankings, rawScores } from './rankings';
import { buildModule } from './holdings';
import type { World } from './types';
/** Build it and finish it at once. */
const built = (w: World, kind: Parameters<typeof buildModule>[1], sector: string) => { const x = buildModule(w, kind, sector); for (const m of Object.values(x.holdings!.modules)) if (m.kind === kind && m.level < 1) m.level = 1; return x; };
import { rankPressure } from './preview';
import { eventDef, optionsFor } from './events';

describe('industry and learning come from what a house holds', () => {
  it('building an academy raises our learning and our Legacy score; a shipyard level raises industry and Economy', () => {
    const w0 = createWorld();
    const P = w0.playerHouseId;
    w0.economy.houses[P]!.stock.othes += 50000;
    w0.economy.houses[P]!.stock.metals += 2000;
    const sector = Object.values(w0.planets).find((p) => p.houseId === P)!.sectors.find((s) => s.roomUsed < s.room)!;
    const before = rawScores(w0)[P]!;
    const w1 = built(w0, 'academy', sector.id);
    expect(learningOf(w1, P)).toBeGreaterThan(learningOf(w0, P));
    // Already the finest learning in the Archon, so Legacy cannot rise on it; but it does not fall.
    expect(rawScores(w1)[P]!.legacy).toBeGreaterThanOrEqual(before.legacy);
    const w2 = built(w0, 'shipyard', sector.id);
    expect(industryOf(w2, P)).toBeGreaterThan(industryOf(w0, P));
    expect(rawScores(w2)[P]!.economy).toBeGreaterThan(before.economy);
  });

  it("our own building does not raise everyone else's estimate", () => {
    const w0 = createWorld();
    const P = w0.playerHouseId;
    w0.economy.houses[P]!.stock.othes += 50000;
    const sector = Object.values(w0.planets).find((p) => p.houseId === P)!.sectors.find((s) => s.roomUsed < s.room)!;
    const w1 = built(w0, 'academy', sector.id);
    const est = (w: World) => computeRankings(w).find((r) => r.id === 'lumen')!.parts.legacy.find((x) => x.label === 'Learning and records')!.value;
    expect(est(w1)).toBe(est(w0));
  });

  it('a decision shows which way each choice leans, and the table itself does not move', () => {
    let w = createWorld();
    for (let i = 0; i < 400 && !w.events.pending.length; i++) w = advanceTurn(w);
    const p = w.events.pending[0];
    if (!p) return;
    const table = JSON.stringify(w.rankings?.table.map((r) => r.place));
    const leans = rankPressure(w, p.id, optionsFor(eventDef(p.defId)!, p).length);
    expect(leans.length).toBe(optionsFor(eventDef(p.defId)!, p).length);
    expect(JSON.stringify(w.rankings?.table.map((r) => r.place))).toBe(table);
    expect(w.events.pending.some((x) => x.id === p.id)).toBe(true);
  });
});
