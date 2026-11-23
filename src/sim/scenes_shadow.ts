// Scenes in the dark and in the streets: infiltrations (rescues, heists, sabotage behind a front, a lost
// Caige recovered) and crises (a riot, a plague, a Drift storm) handled round by round.
import { Rng } from './rng';
import { registerScene, startScene, say, end, odds, test, clamp, once, type Scene } from './scene';
import { seatHolder, ruler } from './query';
import { econ } from './economy';
import { releaseInPlace } from './captives';
import { placeCaptive, storeInVault } from './holdings';
import { learn } from './knowledge';
import { kill } from './death';
import { shiftMood } from './mood';
import { logRecord } from './records';
import { displayName, shortName } from './names';
import { houseName, shiftRegard } from './archon';
import { recoverLegendCaige } from './scenes_power';
import { findSector } from './query';
import type { Character, StatId, World } from './types';

// ================================================================ infiltration

export type InfilGoal = 'rescue' | 'heist' | 'sabotage' | 'legend';
interface Infil { goal: InfilGoal; target: string; agent: string; security: number; alert: number; progress: number; foe?: string }
const infOf = (s: Scene) => s.data as unknown as Infil;
const GOAL_TITLE: Record<InfilGoal, string> = { rescue: 'A rescue', heist: 'A heist', sabotage: 'Behind the lines', legend: 'After a lost Caige' };

/** Who we would send: the Spymaster or our best at moving unseen. */
export function bestAgent(w: World): Character | undefined {
  const P = w.playerHouseId;
  return Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy' && !c.flags.some((f) => f.id === 'captive' || f.id === 'wounded'))
    .sort((a, b) => b.stats.stealth + b.stats.deception + b.stats.agility - (a.stats.stealth + a.stats.deception + a.stats.agility))[0];
}

export function startInfiltration(w: World, goal: InfilGoal, target: string, agentId?: string): Scene {
  const rng = new Rng(w.rng);
  const agent = (agentId ? w.characters[agentId] : undefined) ?? bestAgent(w)!;
  let security = 12, where = 'somewhere guarded', foe: string | undefined, intro = '';
  if (goal === 'rescue') { const cap = w.captives[target]; foe = cap?.heldBy; security = 11 + rng.int(0, 5); where = `the cells of House ${houseName(w, foe ?? '')}`; intro = `${shortName(agent.name)} goes in for ${displayName(w.characters[target]!.name)}.`; }
  if (goal === 'heist') { foe = target; security = 13 + rng.int(0, 4); where = `the vault of House ${houseName(w, target)}`; intro = `${shortName(agent.name)} goes in for a Caige of House ${houseName(w, target)}.`; }
  if (goal === 'sabotage') { const war = w.war?.wars.find((x) => x.fronts.some((f) => f.id === target)); const fr = war?.fronts.find((f) => f.id === target); foe = war ? (war.attacker === w.playerHouseId || war.attackers.includes(w.playerHouseId) ? war.defender : war.attacker) : undefined; security = 11 + rng.int(0, 4); where = fr?.where ?? 'the front'; intro = `${shortName(agent.name)} slips across the line at ${where}.`; }
  if (goal === 'legend') { const l = w.archon?.legends.find((x) => x.id === target); const wild = l?.wildId ? w.archon?.frontier[l.wildId] : undefined; security = 10 + (wild?.hazard === 'drift' || wild?.hazard === 'lurek' ? 5 : wild?.hazard === 'none' ? 0 : 3) + rng.int(0, 3); where = l?.where ?? 'the frontier'; intro = `${shortName(agent.name)} goes looking for ${l?.name} at ${where}.`; }
  w.rng = rng.state;
  return startScene(w, {
    kind: 'infiltration', title: GOAL_TITLE[goal], eyebrow: 'Infiltration', where, maxSteps: 7, meter: -100, meterLabels: ['outside', 'done'],
    gauges: [{ label: 'Alert', value: 0, max: 100, bad: true }], ours: [agent.id], theirs: [{ name: where, note: `security ${security}` }],
    data: { goal, target, agent: agent.id, security, alert: 0, progress: 0, foe } as unknown as Record<string, unknown>, leaveTo: agent.id, intro,
  });
}

registerScene('infiltration', {
  refresh(w, s) {
    const d = infOf(s);
    const a = w.characters[d.agent]!;
    s.meter = d.progress * 2 - 100;
    s.gauges = [{ label: 'Alert', value: Math.round(d.alert), max: 100, bad: true }];
    s.prompt = d.alert >= 70 ? 'They know someone is here.' : d.progress >= 60 ? 'Almost there.' : 'Quiet so far.';
    s.options = [
      { key: 'slip', label: 'Slip past', hint: 'stealth + agility', odds: odds(a, ['stealth', 'agility'], d.security) },
      { key: 'talk', label: 'Talk past them', hint: 'deception + eloquence', odds: odds(a, ['deception', 'eloquence'], d.security) },
      { key: 'force', label: 'Go through them', hint: 'fast and loud', odds: odds(a, ['duelling', 'strength'], d.security - 2) },
      { key: 'wait', label: 'Wait for it to quiet' },
      { key: 'abort', label: 'Get out' },
    ];
  },
  act(w, s, key, rng) {
    const d = infOf(s);
    const a = w.characters[d.agent]!;
    const go = (stats: StatId[], dc: number, gain: number, noise: number, lines: [string, string]) => {
      const t = test(rng, a, stats, dc);
      d.progress = clamp(d.progress + (t.ok ? gain : gain / 5), 0, 100);
      d.alert = clamp(d.alert + noise + (t.ok ? 0 : 25), 0, 100);
      say(s, t.ok ? lines[0] : lines[1], t.ok ? 'good' : 'bad');
    };
    if (key === 'abort') { end(w, s, false, `${shortName(a.name)} gets out with nothing.`, rng); return; }
    if (key === 'slip') go(['stealth', 'agility'], d.security, 25, 3, ['Unseen.', 'A guard turns at the wrong moment.']);
    if (key === 'talk') go(['deception', 'eloquence'], d.security, 22, 6, ['They believe it.', 'They do not believe it.']);
    if (key === 'force') go(['duelling', 'strength'], d.security - 2, 35, 20, ['Through, and fast.', 'It turns into a fight.']);
    if (key === 'wait') { d.alert = clamp(d.alert - 18, 0, 100); say(s, 'They wait in the dark. The place settles.'); }
    if (d.progress >= 100) { end(w, s, true, 'It is done.', rng); return; }
    if (d.alert >= 100) { end(w, s, false, `${shortName(a.name)} is discovered.`, rng); return; }
    if (s.step >= s.maxSteps) end(w, s, false, 'Dawn comes; they have to get out.', rng);
  },
  auto(w, s) {
    const d = infOf(s);
    if (d.alert >= 70) return d.progress >= 75 ? 'slip' : 'wait';
    const best = s.options.filter((o) => o.odds !== undefined).sort((a, b) => (b.odds ?? 0) - (a.odds ?? 0))[0];
    void w;
    return best?.key ?? 'slip';
  },
  finish(w, s, rng) {
    const d = infOf(s);
    const a = w.characters[d.agent];
    const P = w.playerHouseId;
    if (!a) return;
    if (s.result?.good) {
      if (d.goal === 'rescue') { releaseInPlace(w, d.target); if (d.foe) shiftRegard(w, d.foe, P, -15); }
      if (d.goal === 'heist' && d.foe) {
        const cg = Object.values(w.armoury).find((g) => g.houseId === d.foe && !g.bondedTo);
        if (cg) { cg.houseId = P; delete cg.vaultId; storeInVault(w, cg); say(s, `${cg.name} is ours now.`, 'good'); }
        else say(s, 'The vault held nothing worth taking.');
        shiftRegard(w, d.foe, P, -10);
      }
      if (d.goal === 'sabotage') {
        const war = w.war?.wars.find((x) => x.fronts.some((f) => f.id === d.target));
        const fr = war?.fronts.find((f) => f.id === d.target);
        if (war && fr) { const sign = war.attacker === P || war.attackers.includes(P) ? 1 : -1; fr.meter = clamp(fr.meter + sign * 25, -100, 100); war.log.push({ date: w.date, text: `Our people behind the lines at ${fr.where}: depots burn.` }); }
      }
      if (d.goal === 'legend') { const cg = recoverLegendCaige(w, rng, d.target, P); if (cg) say(s, `${cg.name} comes home to our vault.`, 'good'); }
      shiftMood(a, 8);
      logRecord(w, { kind: 'world', type: 'intrigue', severity: 2, text: `${displayName(a.name)}: ${GOAL_TITLE[d.goal].toLowerCase()} at ${s.where}, and it worked.`, who: [{ id: a.id, part: 'went in' }] });
      return;
    }
    if (d.alert < 100) return;
    // Caught.
    if (d.foe && w.houses[d.foe] && rng.chance(0.55)) {
      a.flags.push({ id: 'captive', since: w.date, detail: `held by House ${houseName(w, d.foe)}`, knownBy: [d.foe, P] }, { id: 'missing', since: w.date });
      w.captives[a.id] = { characterId: a.id, heldBy: d.foe, since: w.date, interrogated: false, reason: 'spy' };
      placeCaptive(w, w.captives[a.id]!, 'spy');
      learn(w, d.foe, a.id, 30);
      say(s, `${shortName(a.name)} is taken alive.`, 'bad');
    } else if (rng.chance(0.15)) { kill(w, a, w.date, `killed ${GOAL_TITLE[d.goal].toLowerCase()} at ${s.where}`); say(s, `${shortName(a.name)} does not come back.`, 'bad'); }
    else { a.flags.push({ id: 'wounded', since: w.date, until: { year: w.date.year, cycle: Math.min(799, w.date.cycle + 32) } }); say(s, `${shortName(a.name)} gets out, bleeding.`, 'bad'); }
    if (d.foe) shiftRegard(w, d.foe, P, -20);
  },
});

// ================================================================ crises

export type CrisisKind = 'riot' | 'plague' | 'drift';
interface Crisis { kind: CrisisKind; sectorId: string; spread: number }
const crOf = (s: Scene) => s.data as unknown as Crisis;
const CRISIS_TITLE: Record<CrisisKind, string> = { riot: 'Riot', plague: 'Plague', drift: 'Drift storm' };

export function startCrisis(w: World, kind: CrisisKind, sectorId: string): Scene {
  const f = findSector(w, sectorId);
  const where = f?.sector.name ?? 'one of our sectors';
  const intro = kind === 'riot' ? `${where} has risen. Barricades in the streets, and the garrison waiting for orders.` : kind === 'plague' ? `A sickness in ${where}: three dead this morning, more by tonight.` : `A Drift storm over ${where}. Instruments lie, Caiges hum, and people see things.`;
  return startScene(w, {
    kind: 'crisis', title: `${CRISIS_TITLE[kind]} in ${where}`, eyebrow: 'Crisis', where, maxSteps: 4, meter: -10, meterLabels: ['out of hand', 'contained'],
    gauges: [{ label: 'Spreading', value: 10, max: 50, bad: true }], ours: [], theirs: [{ name: where, note: `unrest ${Math.round(f?.sector.unrest ?? 0)}` }],
    data: { kind, sectorId, spread: 10 } as unknown as Record<string, unknown>, leaveTo: ruler(w, w.playerHouseId)?.id, intro,
  });
}

function crisisPeople(w: World) {
  const P = w.playerHouseId;
  return { steward: seatHolder(w, P, 'steward'), physician: seatHolder(w, P, 'physician'), gm: seatHolder(w, P, 'grandMaster'), lord: ruler(w, P), seer: Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.resonance && c.resonance.band !== 'frostpoint').sort((a, b) => b.stats.willpower - a.stats.willpower)[0] };
}

registerScene('crisis', {
  refresh(w, s) {
    const d = crOf(s);
    const p = crisisPeople(w);
    s.ours = [p.steward?.id, p.physician?.id, p.gm?.id].filter(Boolean) as string[];
    s.gauges = [{ label: 'Spreading', value: Math.round(d.spread), max: 50, bad: true }];
    s.prompt = s.meter >= 30 ? 'It is coming under control.' : s.meter <= -60 ? 'It is getting away from us.' : 'It could go either way.';
    s.options = [
      { key: 'cordon', label: d.kind === 'riot' ? 'Cordon the streets' : 'Quarantine the sector', hint: 'Steward', odds: odds(p.steward, ['logistics', 'stewardship'], 12), why: p.steward ? undefined : 'No Steward.' },
      ...(d.kind === 'plague' ? [{ key: 'heal', label: 'Send the Physician in', hint: 'Physician', odds: odds(p.physician, ['intellect', 'insight'], 12), why: p.physician ? undefined : 'No Physician.' }] : []),
      ...(d.kind === 'drift' ? [{ key: 'anchor', label: 'Send someone who can feel it', hint: p.seer ? shortName(p.seer.name) : 'no one', odds: odds(p.seer, ['willpower', 'resonanceControl'], 13), why: p.seer ? undefined : 'No one with resonance.' }] : []),
      { key: 'force', label: d.kind === 'riot' ? 'Send in the garrison' : 'Lock it down by force', hint: 'Grand Master: fast, and it leaves marks', odds: odds(p.gm, ['tactics', 'leadership'], 11), why: p.gm ? undefined : 'No Grand Master.' },
      { key: 'relief', label: 'Pay for relief', hint: '1,500 othes', why: econ(w, w.playerHouseId).stock.othes < 1500 ? 'Needs 1,500 othes.' : undefined },
      { key: 'speak', label: 'The Highroy speaks to them', hint: 'eloquence + leadership', odds: odds(p.lord, ['eloquence', 'leadership'], 12) },
    ];
  },
  act(w, s, key, rng) {
    const d = crOf(s);
    const p = crisisPeople(w);
    const go = (c: Character | undefined, stats: StatId[], dc: number, gain: number, lines: [string, string]) => {
      const t = test(rng, c, stats, dc);
      s.meter = clamp(s.meter + (t.ok ? gain : gain / 4), -100, 100);
      say(s, t.ok ? lines[0] : lines[1], t.ok ? 'good' : 'bad');
      return t.ok;
    };
    if (key === 'cordon') { if (go(p.steward, ['logistics', 'stewardship'], 12, 25, ['The lines hold.', 'The lines leak.'])) d.spread = Math.max(0, d.spread - 6); }
    if (key === 'heal') go(p.physician, ['intellect', 'insight'], 12, 32, ['The Physician finds what it is.', 'Nothing they try works.']);
    if (key === 'anchor') go(p.seer, ['willpower', 'resonanceControl'], 13, 35, ['They stand in the storm and it bends around them.', 'The storm finds them instead.']);
    if (key === 'force') { go(p.gm, ['tactics', 'leadership'], 11, d.kind === 'riot' ? 35 : 22, ['It is put down.', 'Force makes it worse.']); s.data.forced = ((s.data.forced as number) ?? 0) + 1; }
    if (key === 'relief') { econ(w, w.playerHouseId).stock.othes -= 1500; s.meter = clamp(s.meter + 20, -100, 100); say(s, 'Bread, medicine, coin: it buys time.'); }
    if (key === 'speak') go(p.lord, ['eloquence', 'leadership'], 12, 20, ['They listen to their Highroy.', 'They shout the Highroy down.']);
    // It goes on getting worse on its own.
    s.meter = clamp(s.meter - 6 - d.spread / 4, -100, 100);
    d.spread = clamp(d.spread + 4, 0, 50);
    if (s.meter >= 40) { end(w, s, true, 'Contained.', rng); return; }
    if (s.meter <= -100) { end(w, s, false, 'It has gone past containing.', rng); return; }
    if (s.step >= s.maxSteps) end(w, s, s.meter >= 0, s.meter >= 0 ? 'It burns itself out, and we were ready.' : 'It burns itself out, and leaves its mark.', rng);
  },
  auto(_w, s) {
    const best = s.options.filter((o) => !o.why && o.odds !== undefined).sort((a, b) => (b.odds ?? 0) - (a.odds ?? 0))[0];
    return best?.key ?? 'relief';
  },
  finish(w, s, rng) {
    const d = crOf(s);
    const f = findSector(w, d.sectorId);
    if (!f) return;
    const sec = f.sector;
    const forced = (s.data.forced as number) ?? 0;
    if (s.result?.good) {
      sec.unrest = clamp(sec.unrest - 15 + forced * 6, 0, 100);
      logRecord(w, { kind: 'world', type: 'world', severity: 2, text: `The ${CRISIS_TITLE[d.kind].toLowerCase()} in ${sec.name} is contained.`, placeId: sec.id });
      return;
    }
    sec.unrest = clamp(sec.unrest + 20 + forced * 5, 0, 100);
    sec.population = Math.round(sec.population * (d.kind === 'plague' ? 0.9 : 0.96));
    const locals = Object.values(w.characters).filter((c) => c.alive && c.location?.sectorId === sec.id && c.tier === 'minor');
    const victim = locals.length ? rng.pick(locals) : undefined;
    if (victim) kill(w, victim, w.date, d.kind === 'plague' ? 'the plague' : d.kind === 'riot' ? 'killed in the riot' : 'lost in the Drift storm');
    logRecord(w, { kind: 'world', type: 'world', severity: 3, text: `The ${CRISIS_TITLE[d.kind].toLowerCase()} in ${sec.name} leaves its mark: unrest rises, people are lost${victim ? `, among them ${displayName(victim.name)}` : ''}.`, placeId: sec.id });
  },
});

/** Once an Orbit: a crisis may break out somewhere of ours. */
export function crisesDue(w: World, rng: Rng): void {
  const P = w.playerHouseId;
  if ((w.scenes?.list ?? []).some((x) => x.status !== 'over' && x.kind === 'crisis')) return;
  if ((w.scenes?.seen ?? []).includes(`crisis:${w.date.year}`)) return;
  const sectors = Object.values(w.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors);
  const hot = sectors.filter((x) => x.unrest >= 55);
  let kind: CrisisKind | null = null, sec = undefined as (typeof sectors)[number] | undefined;
  if (hot.length && rng.chance(0.2)) { kind = 'riot'; sec = rng.pick(hot); }
  else if (rng.chance(0.012)) { kind = 'plague'; sec = rng.pick(sectors); }
  else if (rng.chance(0.01)) { kind = 'drift'; sec = rng.pick(sectors); }
  if (!kind || !sec || !once(w, `crisis:${w.date.year}`)) return;
  startCrisis(w, kind, sec.id);
}
