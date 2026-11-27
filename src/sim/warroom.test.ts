import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceTurns } from './tick';
import { startWar } from './war';
import { Rng } from './rng';
import { fightItOut } from './battle';
import { deserialize, serialize } from './save';
import {
  cannotEnter, cannotOrder, mergeGroups, orderGroup, picture, routeFor, setDoctrines, setInstruction, splitGroup, theatreOf, type WGroup,
} from './warroom';
import type { World } from './types';

const begin = (seed: string, attacker = 'torvann') => {
  const w = createWorld(seed);
  startWar(w, new Rng(w.rng), { attacker, defender: w.playerHouseId, goal: 'tribute', rung: 'war' });
  return { w, id: w.war!.wars[0]!.id };
};
const ours = (w: World, id: string): WGroup[] => Object.values(theatreOf(w.war!.wars.find((x) => x.id === id)!)!.groups).filter((g) => g.house === w.playerHouseId);

describe('the War Room', () => {
  it('a war opens on a theatre: worlds, orbits, stations and lanes, with every house\'s groups mustered from its formations', () => {
    const { w, id } = begin('wr-a');
    const t = theatreOf(w.war!.wars[0]!)!;
    const kinds = new Set(Object.values(t.nodes).map((n) => n.kind));
    expect([...kinds].sort()).toEqual(['approach', 'ground', 'lane', 'orbit', 'station']);
    expect(Object.values(t.nodes).some((n) => n.target)).toBe(true);
    // Torvann raises hosts of about 45,000 and a fleet; we raise one host and one fleet to shape ourselves.
    const torvann = Object.values(t.groups).filter((g) => g.house === 'torvann');
    expect(torvann.filter((g) => g.domain === 'ground').length).toBeGreaterThanOrEqual(3);
    expect(torvann.filter((g) => g.domain === 'void').length).toBeGreaterThanOrEqual(2);
    expect(ours(w, id).map((g) => g.domain).sort()).toEqual(['ground', 'void']);
    // Every soldier in a group is drawn from a formation, and no formation gives more than it has.
    for (const f of Object.values(w.war!.formations)) {
      const taken = Object.values(t.groups).flatMap((g) => g.from).filter((s) => s.formationId === f.id).reduce((a, s) => a + s.n, 0);
      expect(taken).toBeLessThanOrEqual(f.strength);
    }
    // Their crews are as good as Torvann is at the void, not as good as its infantry.
    expect(torvann.find((g) => g.domain === 'void')!.quality).toBeLessThan(torvann.find((g) => g.domain === 'ground')!.quality);
  });

  it('groups split, merge, take roles and orders; troops cannot land where we do not hold the sky', () => {
    let { w, id } = begin('wr-b');
    const host = ours(w, id).find((g) => g.domain === 'ground')!;
    const n0 = host.n;
    w = splitGroup(w, id, host.id, 0.3, 'hammer');
    const hammer = ours(w, id).find((g) => g.role === 'hammer')!;
    expect(hammer.n + ours(w, id).find((g) => g.id === host.id)!.n).toBe(n0);
    expect(hammer.commanderId ?? hammer.commanderName).toBeTruthy();
    w = orderGroup(w, id, hammer.id, { role: 'bait', leash: 'free', fallback: 0.6 });
    expect(ours(w, id).find((g) => g.id === hammer.id)!.duty).toBe('support');
    w = mergeGroups(w, id, host.id, hammer.id);
    expect(ours(w, id).find((g) => g.id === host.id)!.n).toBe(n0);
    const war = w.war!.wars[0]!;
    const t = theatreOf(war)!;
    const g = ours(w, id).find((x) => x.domain === 'ground')!;
    expect(cannotEnter(w, war, t, g, 'torvann:w0:g')).toMatch(/no landing/);
    expect(cannotOrder(w, id, ours(w, id).find((x) => x.domain === 'void')!.id, { to: `${w.playerHouseId}:w0:g` })).toMatch(/do not land/);
    expect(routeFor(w, war, t, g, 'relay')!.length).toBeGreaterThan(1);
  });

  it('what we know of them comes from what we can see: their far groups are rumours or nothing', () => {
    const { w } = begin('wr-c');
    const war = w.war!.wars[0]!;
    const pic = picture(w, war)!;
    const t = pic.t;
    const far = Object.values(t.groups).filter((g) => g.side !== pic.side && g.at.startsWith('torvann:'));
    expect(far.every((g) => (t.sight[pic.side][g.id]?.level ?? 0) < 3)).toBe(true);
  });

  it('fights leave after-action reports that say why, and the whole theatre saves and loads', () => {
    let { w, id } = begin('wr-d');
    for (let i = 0; i < 60; i++) { w = advanceTurns(w, 1); for (const b of w.battles?.list ?? []) if (b.status !== 'over') w = fightItOut(w, b.id); }
    const t = theatreOf(w.war!.wars.find((x) => x.id === id)!)!;
    expect(t.reports.length).toBeGreaterThan(0);
    const r = t.reports[0]!;
    expect(r.mults.length).toBeGreaterThan(3);
    expect(r.p).toBeGreaterThanOrEqual(0);
    const back = deserialize(serialize(w));
    expect(theatreOf(back.war!.wars.find((x) => x.id === id)!)!.reports.length).toBe(t.reports.length);
  }, 60000);
});

// ---------------------------------------------------------------- the skill ceiling

type Bot = (w: World, id: string, turn: number) => World;

/** Marches out to meet them in the open: the host to the border relay, the fleet into the lanes. */
const naive: Bot = (w, id, turn) => {
  if (turn) return w;
  for (const g of ours(w, id)) w = orderGroup(w, id, g.id, g.domain === 'ground' ? { to: 'relay', role: 'spearhead' } : { to: 'lanes', role: 'line' });
  return w;
};

/** Behind the walls with a hammer beside the anvil; the fleet kept alive as a strike wing hunting their transports, and raiders on their roads. */
const skilled: Bot = (w, id, turn) => {
  const P = w.playerHouseId;
  if (turn === 0) {
    w = setDoctrines(w, id, ['fortress', 'supply', 'silent', 'concentration']);
    w = setInstruction(w, id, 'width', 0);
    w = setInstruction(w, id, 'risk', 1);
    w = splitGroup(w, id, ours(w, id).find((g) => g.domain === 'ground')!.id, 0.35, 'hammer');
    w = splitGroup(w, id, ours(w, id).find((g) => g.domain === 'void')!.id, 0.4, 'laneRaider');
    for (const g of ours(w, id)) {
      if (g.role === 'laneRaider') w = orderGroup(w, id, g.id, { to: 'torvann:ap' });
      if (g.role === 'line') w = orderGroup(w, id, g.id, { role: 'wing', to: 'dark' });
    }
    return w;
  }
  const t = theatreOf(w.war!.wars.find((x) => x.id === id)!)!;
  const side = ours(w, id)[0]?.side ?? 'defenders';
  const wing = ours(w, id).find((g) => g.role === 'wing');
  if (wing && !wing.engaged && !wing.path.length) {
    const prey = Object.entries(t.sight[side]).map(([gid, s]) => ({ g: t.groups[gid], s })).find((x) => x.g && x.s.level >= 1 && x.g.domain === 'ground'
      && ['lane', 'approach', 'orbit'].includes(t.nodes[x.s.at]!.kind) && !Object.values(t.groups).some((e) => e.side !== side && e.domain === 'void' && e.at === x.s.at && e.duty !== 'support'));
    const to = prey ? prey.s.at : 'dark';
    if (wing.at !== to) try { w = orderGroup(w, id, wing.id, { to }); } catch { /* no way there now */ }
  }
  void P;
  return w;
};

function play(seed: string, bot: Bot): 'won' | 'lost' | 'drawn' {
  let { w, id } = begin(seed);
  for (let turn = 0; turn < 900; turn++) {
    w = bot(w, id, turn);
    w = advanceTurns(w, 1);
    for (const b of w.battles?.list ?? []) if (b.status !== 'over' && b.kind === 'war') w = fightItOut(w, b.id);
    if (w.war!.wars.find((x) => x.id === id)!.status !== 'active') break;
  }
  const war = w.war!.wars.find((x) => x.id === id)!;
  return war.result?.winner === 'defenders' ? 'won' : war.result?.winner === 'attackers' ? 'lost' : 'drawn';
}

describe('the skill ceiling', () => {
  it('a well-played Alerion can beat Torvann; a badly played one cannot', () => {
    const seeds = ['a', 'c', 'd', 'e'];
    const good = seeds.map((s) => play(s, skilled));
    const bad = seeds.map((s) => play(s, naive));
    expect(good.filter((x) => x === 'won').length).toBeGreaterThanOrEqual(2);
    expect(bad.filter((x) => x === 'won').length).toBe(0);
  }, 240000);
});
