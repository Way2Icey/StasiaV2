import { createWorld } from './world';
import { advanceTurn } from './tick';
import { answerEvent, allDefs, fireStage } from './events';
import { battleOf, fightItOut, createBattle, runOut } from './battle';
import { shiftOpinion } from './relationships';
import { Rng } from './rng';
import { econ } from './economy';
import type { World } from './types';
import { addThread } from './storystate';
import { isAway } from './court';
import { shiftRelation } from './relations';

/** A world with something for every arc to cast: bearers, free Caiges, Redline climbers, the old and the young. */
function richWorld(): World {
  const w = structuredClone(createWorld());
  for (let i = 0; i < 60; i++) w.events.pending = [], w.ambitions.audiences = [], Object.assign(w, advanceTurn(w));
  const P = w.playerHouseId;
  econ(w, P).stock.othes += 20000;
  const ours = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy');
  const home = w.planets[w.houses[P]!.capitalPlanetId]!;
  ours.forEach((c, i) => {
    if (i % 3 === 0) c.resonance = { degrees: 190, band: 'ambercore', type: 'gravitic' };
    if (i % 4 === 1) c.hidden.drift = 13;
    if (i % 5 === 2) { c.hidden.ambition = 15; c.hidden.loyalty = 6; }
  });
  for (let i = 0; i < 3; i++) w.armoury[`cgt${i}`] = { id: `cgt${i}`, name: `Test ${i}`, type: 'magnetic', band: 'ambercore', houseId: P, found: w.date, foundAt: { planetId: home.id, sectorId: home.sectors[0]!.id } };
  const bearer = ours.find((c) => c.role === 'Knight') ?? ours[0]!;
  w.armoury.cgt0!.bondedTo = bearer.id; bearer.flags.push({ id: 'caigeBonded', since: w.date }); bearer.stats.caigeSync = 14;
  const sib = ours.find((c) => c.id !== bearer.id && c.familyId === bearer.familyId) ?? ours.find((c) => c.id !== bearer.id)!;
  sib.familyId = bearer.familyId; sib.resonance = { degrees: 100, band: 'bluewake', type: 'drift' }; sib.flags = sib.flags.filter((f) => f.id !== 'caigeBonded');
  sib.birth = { ...bearer.birth };
  const old = ours.find((c) => c.id !== bearer.id && c.id !== sib.id && !c.seat)!;
  w.armoury.cgt1!.bondedTo = old.id; old.flags.push({ id: 'caigeBonded', since: w.date });
  old.birth = { year: w.date.year - Math.ceil(old.lifespan * 0.85), cycle: 0 };
  // Threads for the pickups to find.
  const ruler = w.houses[P]!.rulerId!;
  const foreign = Object.values(w.characters).find((c) => c.alive && c.houseId !== P && c.tier === 'full')!;
  const t = (personId: string, kind: 'grudge' | 'debt' | 'secret' | 'omen' | 'scar' | 'vow' | 'favour', text: string, about?: string) => addThread(w, personId, kind, text, about);
  t(ours[0]!.id, 'grudge', 'Beaten at the Exchange', foreign.id);
  t(ours[1]!.id, 'debt', 'Owes the Highroy their life', ruler);
  t(ours.find((c) => !c.flags.some((f) => ['travelling', 'posted', 'ward', 'hunting'].includes(f.id)) && c !== ours[0] && c !== ours[1])!.id, 'secret', 'Their secret is out');
  t(ours[3]!.id, 'omen', 'Woke in a storm');
  t(ours[4]!.id, 'scar', 'The surge left a mark');
  t(ours[5]!.id, 'vow', 'Swore at their knighting: "I will be Champion."');
  t(ours[6]!.id, 'grudge', 'Their Caige was taken', ruler);
  t(ruler, 'favour', 'A Caige returned', foreign.houseId);
  // For the knights' arcs: an aspirant who failed, two suitors, an aging Champion, a sour crew, a recent battle.
  const free = ours.filter((c) => !isAway(w, c.id) && !c.seat);
  const asp = free.filter((c) => c.role !== 'Knight' && !c.flags.some((f) => f.id === 'knighted')).pop()!;
  (w.ladder ??= { of: {}, snaps: {} } as never).of[asp.id] = { stage: 'aspirant', since: w.date, failed: 2, history: [] };
  const ks = free.filter((c) => c !== asp).slice(0, 4);
  for (const k of ks) { k.role = 'Knight'; if (!k.flags.some((f) => f.id === 'knighted')) k.flags.push({ id: 'knighted', since: w.date }); }
  shiftOpinion(w, ks[0]!.id, ks[3]!.id, 80, 'test'); shiftOpinion(w, ks[1]!.id, ks[3]!.id, 80, 'test');
  ks[2]!.hidden.temperament = 16; ks[2]!.stats.duelling = 20;
  const champ = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.seat === 'champion');
  if (champ) { champ.stats.duelling = 9; champ.birth = { year: w.date.year - 60, cycle: 0 }; }
  const kids = free.filter((c) => !ks.includes(c) && c !== asp).slice(0, 2);
  kids.forEach((k, i) => { k.role = i ? 'Daughter of the Highroy' : 'Son of the Highroy'; k.birth = { year: w.date.year - 30 - i, cycle: 0 }; });
  const elder = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.seat === 'elder');
  if (elder) elder.birth = { year: w.date.year - Math.ceil(elder.lifespan * 0.85), cycle: 0 };
  home.sectors[0]!.unrest = 60;
  const fac = Object.values(w.lanes.factions)[0]!;
  const cap = fac.members.find((m) => m.role === 'captain')!; cap.fate = 'captured'; cap.fateBy = ruler;
  const rv = Object.keys(w.houses).filter((h) => h !== P);
  w.story!.act = 'crisis'; w.story!.tension = 80;
  w.realm.feuds.push({ id: 'fdtest', a: P, b: rv[0]!, since: w.date, cause: 'test' });
  fac.rel[P] = -60;
  shiftRelation(w, rv[0]!, rv[1]!, -40); shiftRelation(w, rv[1]!, rv[0]!, -40);
  const agent = free.find((c) => !ks.includes(c) && c !== asp && !kids.includes(c))!;
  agent.role = 'Envoy'; agent.flags.push({ id: 'agent', since: w.date }); agent.hidden.loyalty = 6;
  const baby = Object.values(w.characters).filter((c) => c.alive && c.houseId === P).sort((a, b) => (b.birth.year * 800 + b.birth.cycle) - (a.birth.year * 800 + a.birth.cycle))[0]!;
  baby.birth = { year: w.date.year - 1, cycle: w.date.cycle };
  const ship = Object.values(w.fleet.ships).find((x) => x.houseId === P);
  if (ship) ship.crewMood = 20;
  const b = createBattle(w, { kind: 'arc', title: 'test fight', theatre: 'surface', where: 'x', ours: { name: 'us', commander: { id: ks[2]!.id }, mass: 20, fighters: [{ id: ks[2]!.id }, { id: ks[1]!.id }] }, theirs: { name: 'them', commander: { id: foreign.id }, mass: 20, fighters: [{ id: foreign.id }] } });
  runOut(b, w);
  const fdead = b.fighters.find((f) => f.side === 1)!; fdead.state = 'dead';
  b.fighters.find((f) => f.id === ks[2]!.id)!.deeds.push(`killed ${fdead.name}`);
  b.fighters.find((f) => f.id === ks[1]!.id)!.state = 'pulled';
  return w;
}

const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const firstStages = () => allDefs().filter((d) => !d.stage && d.trigger === 'home' && d.weight > 0);

describe('every arc runs to an end', () => {
  it('each first stage, each option, followed through its stages and battles, throws nothing', () => {
    const base = richWorld();
    const errors: string[] = [];
    let fired = 0, multi = 0;
    const depth: Record<string, number> = {};
    for (const def of firstStages()) {
      for (let opt = 0; opt < def.options.length; opt++) {
        let w = structuredClone(base);
        const r = Rng.fromSeed(def.id + opt);
        try {
          const p = fireStage(w, r, def.id, {});
          if (!p) continue;
          fired++;
          w = answerEvent(w, p.id, opt);
          const arcId = w.events.log[0] && w.story?.arcs.find((a) => a.stages.length && a.stages[0]!.title === def.title)?.id;
          let stages = 1;
          for (let t = 0; t < 250 && arcId; t++) {
            w = advanceTurn(w);
            for (const b of (w.battles?.list ?? []).filter((x) => x.status !== 'over')) w = fightItOut(w, b.id);
            const next = w.events.pending.find((x) => x.arcId === arcId || (x.struggleId && w.story?.struggles.some((s) => s.id === x.struggleId)));
            w.events.pending = w.events.pending.filter((x) => x === next);
            w.ambitions.audiences = [];
            if (next) { w = answerEvent(w, next.id, (opt + t) % 2); stages++; }
            const run = w.story!.arcs.find((a) => a.id === arcId);
            if (!run?.open) break;
          }
          if (stages > 1) multi++;
          depth[def.id] = Math.max(depth[def.id] ?? 0, stages);
          void battleOf;
        } catch (e) { errors.push(`${def.id}#${opt}: ${(e as Error).message}\n${(e as Error).stack?.split('\n').slice(1, 3).join('\n')}`); }
      }
    }
    console.log(`fired ${fired}, multi-stage ${multi}, errors ${errors.length}`);
    if (ENV.DEPTH) console.log(JSON.stringify(depth));
    if (ENV.DEPTH) console.log('never fired:', firstStages().map((d) => d.id).filter((id) => !(id in depth)).join(' '));
    expect(errors).toEqual([]);
    expect(fired).toBeGreaterThan(20);
  });
});

describe('every struggle runs', () => {
  it('each turning point and each ending, with each option, throws nothing', async () => {
    const { STRUGGLE, startStruggle } = await import('./story');
    const base = richWorld();
    const errors: string[] = [];
    const P = base.playerHouseId;
    const ours = Object.values(base.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy');
    for (const kind of Object.keys(STRUGGLE)) {
      for (const stage of ['open', 'down', 'up', 'won', 'lost']) {
        const def = allDefs().find((d) => d.id === `str:${kind}:${stage}`);
        if (!def) { if (stage !== 'open') errors.push(`missing str:${kind}:${stage}`); continue; }
        for (let opt = 0; opt < def.options.length; opt++) {
          let w = structuredClone(base);
          try {
            const s = startStruggle(w, kind as never, { strength: 12, theirName: 'them', cast: { personId: ours[0]!.id, secondId: ours[1]!.id, sectorId: w.planets[w.houses[P]!.capitalPlanetId]!.sectors[0]!.id } });
            const p = fireStage(w, Rng.fromSeed(kind + stage + opt), def.id, { struggleId: s.id, personId: ours[0]!.id, secondId: ours[1]!.id, sectorId: s.cast.sectorId });
            if (!p) continue;
            w = answerEvent(w, p.id, opt);
            for (let t = 0; t < 30; t++) { w = advanceTurn(w); for (const b of (w.battles?.list ?? []).filter((x) => x.status !== 'over')) w = fightItOut(w, b.id); w.events.pending = []; w.ambitions.audiences = []; }
          } catch (e) { errors.push(`${def.id}#${opt}: ${(e as Error).message}`); }
        }
      }
    }
    expect(errors).toEqual([]);
  });
});
