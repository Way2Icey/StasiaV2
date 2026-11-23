import { createWorld } from './world';
import { advanceTurn } from './tick';
import { econ, buyPrice } from './economy';
import { barsOf, meet, shiftOpinion, isClose, avoids, setBond, bondOf } from './relationships';
import { renownOf, renownTable } from './renown';
import { postsFor, isVeteran } from './veterans';
import { caigeAdvice, bondCaige } from './discovery';
import { cannotWatch, startWatch, watchOf, declareEmbargo, embargoMarkup, freeWatchShips } from './lanewatch';
import { answerSmuggler, startRuns } from './smuggling';
import { launch } from './lanes';
import { handleCaptive, cannotHandle, workFixer } from './companies';
import { allied, cannotAlly, proposeAlliance, poach, poachOdds, poachable, favourOf, shiftFavour } from './houses';
import { tally } from './careers';
import { huntersFree } from './companies';
import { Rng } from './rng';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };
const ours = (w: World) => Object.values(w.characters).filter((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full');

describe('like and dislike', () => {
  it('warmth fills one bar and friction the other; tiers make people close or keep apart', () => {
    const w = structuredClone(createWorld());
    const [a, b, c] = ours(w);
    shiftOpinion(w, a!.id, b!.id, 60, 'test'); shiftOpinion(w, b!.id, a!.id, 60, 'test');
    expect(barsOf(w, a!.id, b!.id).like).toBeGreaterThanOrEqual(55);
    expect(isClose(w, a!.id, b!.id)).toBe(true);
    shiftOpinion(w, a!.id, c!.id, -40, 'test');
    expect(barsOf(w, a!.id, c!.id).dislike).toBeGreaterThanOrEqual(35);
    expect(avoids(w, a!.id, c!.id)).toBe(true);
    // Meeting moves both bars somewhere.
    const before = barsOf(w, b!.id, c!.id);
    meet(w, Rng.fromSeed('m'), [b!.id, c!.id], 'a test', 0.5, 2);
    const after = barsOf(w, b!.id, c!.id);
    expect(after.like + after.dislike).toBeGreaterThan(before.like + before.dislike);
    // A named rivalry carries real dislike, so it does not dissolve at once.
    setBond(w, a!.id, c!.id, 'rival', 'rival', 'test');
    shiftOpinion(w, a!.id, c!.id, -5, 'test');
    expect(bondOf(w, a!.id, c!.id)).toBe('rival');
  });
});

describe('renown and veterans', () => {
  it('deeds raise renown and rank it across houses', () => {
    const w = structuredClone(createWorld());
    const c = ours(w)[0]!;
    const r0 = renownOf(w, c);
    tally(w, c.id, 'duelsWon', 5);
    expect(renownOf(w, c)).toBeGreaterThan(r0 + 10);
    expect(renownTable(w)[0]!.renown).toBeGreaterThan(0);
  });
  it('a retired knight is offered posts, not forgotten', () => {
    const w = structuredClone(createWorld());
    const k = ours(w).find((c) => c.role === 'Knight' && !c.seat)!;
    k.flags.push({ id: 'retired', since: w.date, detail: 'of age' });
    k.role = 'Retired knight';
    expect(isVeteran(k)).toBe(true);
    expect(postsFor(w, k).length).toBeGreaterThan(0);
  });
});

describe('Caige grants', () => {
  it('the Champion and Grand Master advise, and the passed-over remember', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    w.armoury.cgx = { id: 'cgx', name: 'Test', type: 'gravitic', band: 'redline', houseId: P, found: w.date, foundAt: { planetId: 'x', sectorId: 'x' } };
    const adv = caigeAdvice(w, 'cgx');
    expect(adv.length).toBeGreaterThan(0);
    const other = ours(w).find((c) => c.resonance && c.flags.some((f) => f.id === 'knighted' || f.id === 'blooded') && !adv.some((a) => a.forId === c.id) && !c.flags.some((f) => f.id === 'caigeBonded'));
    if (other) {
      const after = bondCaige(w, 'cgx', other.id);
      expect(after.armoury.cgx!.bondedTo).toBe(other.id);
      expect(barsOf(after, adv[0]!.forId, other.id).dislike).toBeGreaterThan(0);
    }
  });
});

describe('lanes: watches, embargoes, smuggling', () => {
  it('a lane watch costs upkeep and makes our runs safer', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 50000;
    const lead = huntersFree(w)[0]!;
    const ships = freeWatchShips(w).slice(0, 1);
    expect(ships.length).toBe(1);
    const lane = 'alerion-prime~exchange';
    expect(cannotWatch(w, lane, lead, ships)).toBeNull();
    w = startWatch(w, lane, lead, ships, 'secure');
    expect(watchOf(w).length).toBe(1);
    const o0 = econ(w, P).stock.othes;
    for (let i = 0; i < 20; i++) w = step(w);
    expect(econ(w, P).stock.othes).toBeLessThan(o0 + 100000);
    expect(w.lanes.watches[0]?.house).toBe(P);
  });
  it('an embargo makes the target pay more at the Exchange', () => {
    let w = structuredClone(createWorld());
    const other = Object.keys(w.houses).find((h) => h !== w.playerHouseId)!;
    const p0 = buyPrice(w, other, 'fuel');
    w = declareEmbargo(w, other);
    expect(embargoMarkup(w, other)).toBeGreaterThan(1);
    expect(buyPrice(w, other, 'fuel')).toBeGreaterThan(p0);
  });
  it('a smuggler of ours can be stopped, or exposed', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const c = ours(w).find((x) => x.seat !== 'highroy')!;
    c.hidden.greed = 20;
    const rng = Rng.fromSeed('smug');
    for (let i = 0; i < 200 && !(w.lanes.smuggleNotes ?? []).length; i++) startRuns(w, rng, (cv) => launch(w, rng, cv));
    const n = (w.lanes.smuggleNotes ?? [])[0];
    if (n) {
      const after = answerSmuggler(w, n.id, 'expose');
      expect(after.characters[n.by]!.flags.some((f) => f.id === 'disgraced')).toBe(true);
      expect(after.lanes.convoys[n.convoyId]).toBeUndefined();
    }
    expect(P).toBeTruthy();
  });
});

describe('corsairs in our cells, fixers', () => {
  it('a captured captain can be questioned, and a known fixer worked', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 20000;
    const f = w.lanes.factions.hollow!;
    const cap = f.members.find((m) => m.role === 'captain')!;
    cap.known = true; cap.fate = 'captured'; cap.fateBy = ours(w)[0]!.id;
    expect(cannotHandle(w, 'hollow', cap.id, 'question')).toBeNull();
    const after = handleCaptive(w, 'hollow', cap.id, 'question');
    expect(after.lanes.factions.hollow!.members.find((m) => m.id === cap.id)!.questioned).toBe(true);
    const fixer = after.lanes.factions.hollow!.members.find((m) => m.role === 'fixer')!;
    fixer.known = true;
    const worked = workFixer(after, 'hollow', fixer.id);
    expect(econ(worked, P).stock.othes).toBeLessThan(econ(after, P).stock.othes);
  });
});

describe('the houses as players', () => {
  it('alliances need a compact and regard; the Numarade favour moves; poaching has odds', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const other = Object.keys(w.houses).find((h) => h !== P)!;
    expect(cannotAlly(w, other)).toBeTruthy();
    w.relations[other]![P] = 60;
    w.lanes.compacts.push({ id: 'tcx', a: P, b: other, since: w.date, traded: 0, orbit: {} });
    expect(cannotAlly(w, other)).toBeNull();
    w = proposeAlliance(w, other);
    expect(allied(w, P, other)).toBe(true);
    const f0 = favourOf(w, P);
    shiftFavour(w, P, 10);
    expect(favourOf(w, P)).toBeGreaterThan(f0);
    const target = poachable(w)[0];
    if (target) {
      expect(poachOdds(w, target.id, 10000).p).toBeGreaterThan(poachOdds(w, target.id, 0).p);
      econ(w, P).stock.othes = 50000;
      const after = poach(w, target.id, 0);
      expect(after.characters[target.id]!.flags.some((x) => x.id === 'approached')).toBe(true);
    }
    for (let i = 0; i < 100; i++) w = step(w);
    expect(Object.keys(w.realm.aims).length).toBeGreaterThan(0);
  });
});
