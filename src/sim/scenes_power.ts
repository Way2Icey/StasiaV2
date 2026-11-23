// The power system made live: the souls inside a Caige, its density (CDI) and form, the bonding ritual that
// decides them, and the guided awakening of someone's resonance.
//
// Canon (Power Systems in the vault): a Caige holds souls; the wielder's will must outweigh theirs to align
// them, willingly (stable, strong) or by force (weaker, unstable). CDI measures how purely the wielder's
// will becomes form, 0 to 1, never 1. Form follows alignment: the generous and steadfast make shields,
// staffs and greatswords; the proud and hungry make daggers, claws and axes. An unbreakable soul cannot be
// aligned at all: it makes the Caige immensely dense, but its form will always be its own. Rarely, a
// well-aligned Caige allows two transmuted states.
import { Rng } from './rng';
import { registerScene, startScene, say, end, odds, test, clamp, nameOf, type Scene } from './scene';
import { shiftMood } from './mood';
import { bandFor } from './characters';
import { displayName, shortName } from './names';
import { logRecord } from './records';
import { addThread } from './storystate';
import { storeInVault } from './holdings';
import type { Caige, Character, World } from './types';

export type Virtue = 'kind' | 'faithful' | 'proud' | 'cruel' | 'restless';
export const VIRTUE_LABEL: Record<Virtue, string> = { kind: 'kind', faithful: 'faithful', proud: 'proud', cruel: 'cruel', restless: 'restless' };
export interface Soul { name: string; will: number; virtue: Virtue; unbreakable?: boolean; form?: string }

const SOUL_GIVEN = ['Aved', 'Corra', 'Ilsen', 'Maro', 'Teth', 'Vesh', 'Orrin', 'Saba', 'Halde', 'Quen', 'Ruvel', 'Isk', 'Dorna', 'Fenn', 'Lirae', 'Gath'];
const SOUL_EPITHET = ['the drowned', 'of the long march', 'who kept the gate', 'the unforgiven', 'of the third crusade', 'the singer', 'who burned', 'the patient', 'of no house', 'the oathbreaker'];
const DEFENSIVE = ['a tower shield', 'a staff', 'a greatsword', 'a warding gauntlet', 'a halberd'];
const OFFENSIVE = ['a dagger', 'claws', 'an axe', 'a sabre', 'a war-pick', 'a chain-blade'];

/** Give every Caige its souls (old ones too), from its id, so the same Caige always holds the same dead. */
export function ensureCaigeDepth(w: World): void {
  for (const cg of Object.values(w.armoury ?? {})) {
    if (cg.souls) continue;
    const rng = Rng.fromSeed(`souls/${cg.id}`);
    const n = rng.int(2, 5);
    cg.souls = Array.from({ length: n }, () => ({
      name: `${rng.pick(SOUL_GIVEN)} ${rng.pick(SOUL_EPITHET)}`, will: 6 + rng.int(0, 10) + (cg.band === 'redline' ? 2 : cg.band === 'whitebreak' ? 4 : 0),
      virtue: rng.weighted([['kind', 2], ['faithful', 2], ['proud', 2], ['cruel', 1.2], ['restless', 1.5]] as const),
    }));
    if (rng.chance(cg.band === 'whitebreak' ? 0.25 : 0.03)) { cg.souls[0]!.unbreakable = true; cg.souls[0]!.will = 20; cg.souls[0]!.form = rng.pick([...DEFENSIVE, ...OFFENSIVE]); }
    if (cg.bondedTo && cg.cdi === undefined) { cg.cdi = Math.round((0.25 + rng.next() * 0.4) * 1000) / 1000; cg.form = rng.pick([...DEFENSIVE, ...OFFENSIVE]); cg.forms = 1; }
  }
}

export function cdiWord(cdi?: number): string {
  if (cdi === undefined) return 'unmeasured';
  return cdi > 0.95 ? 'near-perfect' : cdi >= 0.8 ? 'purified' : cdi >= 0.5 ? 'aligned' : cdi >= 0.2 ? 'coherent' : 'fragmentary';
}

/** What a Caige adds to its bearer in a fight. */
export function caigeEdge(w: World, c: Character): number {
  const cg = Object.values(w.armoury ?? {}).find((g) => g.bondedTo === c.id);
  if (!cg || cg.cdi === undefined) return 1;
  return 1 + cg.cdi * 0.35 + ((cg.forms ?? 1) > 1 ? 0.05 : 0);
}

// ================================================================ bonding

/** How hard a soul is to move, by approach: a will of 16 is hard, 8 is easy. */
function dcOf(soul: Soul, how: 'coax' | 'share' | 'force'): number {
  const base = 5 + soul.will * 0.55;
  if (how === 'coax') return base + 1;
  if (how === 'force') return base - 1;
  return base + (soul.virtue === 'kind' || soul.virtue === 'faithful' ? -1.5 : 4);
}

interface Rite { caigeId: string; who: string; forced: number; coaxed: number; yielded?: boolean }
const riteOf = (s: Scene) => s.data as unknown as Rite;

export function startBonding(w: World, caigeId: string, personId: string): Scene {
  ensureCaigeDepth(w);
  const cg = w.armoury[caigeId]!;
  const c = w.characters[personId]!;
  return startScene(w, {
    kind: 'bonding', title: `${displayName(c.name)} and ${cg.name}`, eyebrow: 'The bonding', where: 'the vault', maxSteps: cg.souls!.length,
    meter: 0, meterLabels: ['against them', 'aligned'], gauges: [{ label: 'Strain', value: 0, max: 100, bad: true }],
    ours: [c.id], theirs: cg.souls!.map((s) => ({ name: s.name, note: `${s.unbreakable ? 'unbreakable · ' : ''}${VIRTUE_LABEL[s.virtue]} · will ${s.will}` })),
    data: { caigeId, who: personId, forced: 0, coaxed: 0 } as unknown as Record<string, unknown>, leaveTo: personId,
    intro: `${shortName(c.name)} takes ${cg.name} in both hands. The navisium is cold, then not. There are ${cg.souls!.length} in it, and they notice.`,
  });
}

registerScene('bonding', {
  refresh(w, s) {
    const r = riteOf(s);
    const cg = w.armoury[r.caigeId]!;
    const c = w.characters[r.who]!;
    const soul = cg.souls![s.step];
    if (!soul) return;
    s.prompt = soul.unbreakable
      ? `${soul.name} will not bend. Nothing anyone has done has ever moved a soul like this one.`
      : `${soul.name} rises to meet ${shortName(c.name)}: ${VIRTUE_LABEL[soul.virtue]}, will ${soul.will}.`;
    s.options = soul.unbreakable ? [
      { key: 'yield', label: 'Let it keep its own form', hint: 'immense density; the form will always be its own' },
      { key: 'stop', label: 'Put the Caige down' },
    ] : [
      { key: 'coax', label: 'Coax it to align', hint: 'willpower + composure', odds: odds(c, ['willpower', 'composure'], dcOf(soul, 'coax')) },
      { key: 'share', label: 'Share a dream with it', hint: soul.virtue === 'kind' || soul.virtue === 'faithful' ? 'it might listen' : 'not this one', odds: odds(c, ['insight', 'eloquence'], dcOf(soul, 'share')) },
      { key: 'force', label: 'Force it', hint: 'determination + willpower; unstable', odds: odds(c, ['determination', 'willpower'], dcOf(soul, 'force')) },
      { key: 'stop', label: 'Put the Caige down' },
    ];
  },
  act(w, s, key, rng) {
    const r = riteOf(s);
    const cg = w.armoury[r.caigeId]!;
    const c = w.characters[r.who]!;
    const soul = cg.souls![s.step - 1]!;
    const strain = s.gauges[0]!;
    if (key === 'stop') { end(w, s, false, `${shortName(c.name)} puts ${cg.name} down. It is not theirs.`, rng); return; }
    if (key === 'yield') { r.yielded = true; s.meter = clamp(s.meter + 10, -100, 100); say(s, `${shortName(c.name)} stops fighting ${soul.name}, and it lets them hold it.`, 'big'); }
    if (key === 'coax') {
      const t = test(rng, c, ['willpower', 'composure'], dcOf(soul, 'coax'));
      s.meter = clamp(s.meter + (t.ok ? 28 : -12), -100, 100); strain.value = clamp(strain.value + (t.ok ? 8 : 18), 0, 100);
      if (t.ok) r.coaxed++;
      say(s, t.ok ? `${soul.name} turns toward them, slowly, and stays.` : `${soul.name} will not be coaxed.`, t.ok ? 'good' : 'bad');
    }
    if (key === 'share') {
      const t = test(rng, c, ['insight', 'eloquence'], dcOf(soul, 'share'));
      s.meter = clamp(s.meter + (t.ok ? 35 : -8), -100, 100); strain.value = clamp(strain.value + (t.ok ? 5 : 12), 0, 100);
      if (t.ok) r.coaxed++;
      say(s, t.ok ? `They tell ${soul.name} what they mean to do with it. ${soul.name} wants that too.` : `${soul.name} does not care what they dream of.`, t.ok ? 'good' : 'bad');
    }
    if (key === 'force') {
      const t = test(rng, c, ['determination', 'willpower'], dcOf(soul, 'force'));
      s.meter = clamp(s.meter + (t.ok ? 16 : -20), -100, 100); strain.value = clamp(strain.value + (t.ok ? 22 : 35), 0, 100);
      r.forced++;
      say(s, t.ok ? `${soul.name} is made to kneel. It will remember.` : `${soul.name} fights back, hard.`, t.ok ? undefined : 'bad');
    }
    if (strain.value >= 100) { end(w, s, false, `The strain is too much: ${shortName(c.name)} falls, and ${cg.name} goes quiet.`, rng); return; }
    if (s.step >= s.maxSteps) end(w, s, s.meter >= 0 || !!r.yielded, s.meter >= 0 || r.yielded ? `${cg.name} answers ${shortName(c.name)}.` : `The souls in ${cg.name} will not have them.`, rng);
  },
  auto(w, s) {
    const r = riteOf(s);
    const cg = w.armoury[r.caigeId]!;
    const soul = cg.souls![s.step];
    if (soul?.unbreakable) return 'yield';
    if (s.gauges[0]!.value >= 70) return 'stop';
    const coax = s.options.find((o) => o.key === 'coax')?.odds ?? 0, share = s.options.find((o) => o.key === 'share')?.odds ?? 0;
    return share > coax ? 'share' : 'coax';
  },
  finish(w, s, rng) {
    const r = riteOf(s);
    const cg = w.armoury[r.caigeId];
    const c = w.characters[r.who];
    if (!cg || !c) return;
    const strain = s.gauges[0]!.value;
    if (!s.result?.good) {
      shiftMood(c, -8);
      if (strain >= 100) { c.flags.push({ id: 'wounded', since: w.date, until: { year: w.date.year, cycle: Math.min(799, w.date.cycle + 24) } }); cg.stability = clamp((cg.stability ?? 70) - 15, 0, 100); }
      return;
    }
    // The bond: who they are, made into a weapon.
    const align = (s.meter + 100) / 200;
    const will = (c.stats.willpower + c.stats.determination) / 40;
    const unbreakable = cg.souls!.find((x) => x.unbreakable);
    cg.cdi = Math.round(clamp(0.12 + align * 0.5 + will * 0.25 + (r.yielded ? 0.15 : 0) - r.forced * 0.04 + rng.gauss() * 0.03, 0.05, 0.97) * 1000) / 1000;
    cg.form = unbreakable?.form ?? (r.coaxed >= r.forced ? rng.pick(DEFENSIVE) : rng.pick(OFFENSIVE));
    cg.forms = s.meter >= 80 && !unbreakable ? 2 : 1;
    if (r.forced) cg.stability = clamp((cg.stability ?? 70) - r.forced * 6, 0, 100);
    for (const x of Object.values(w.characters)) if (x.alive && x.id !== c.id) x.flags = x.flags.filter((f) => !(f.id === 'caigeBonded' && f.detail === `"${cg.name}"`));
    cg.bondedTo = c.id;
    delete cg.vaultId;
    c.flags = c.flags.filter((f) => f.id !== 'caigeBonded');
    c.flags.push({ id: 'caigeBonded', since: w.date, detail: `"${cg.name}", ${cg.form}` });
    c.stats.caigeSync = clamp(c.stats.caigeSync + 2, 1, 20);
    shiftMood(c, 10);
    if (r.forced >= 2) addThread(w, c.id, 'omen', `Forced the souls of ${cg.name}; they have not forgiven it`);
    logRecord(w, { kind: 'world', type: 'world', severity: 2, text: `${displayName(c.name)} bonds with ${cg.name}: ${cg.form}, CDI ${cg.cdi.toFixed(3)} (${cdiWord(cg.cdi)})${cg.forms === 2 ? ', and it holds a second form' : ''}.`, who: [{ id: c.id, part: 'bonded' }] });
  },
});

// ================================================================ awakening

interface Wake { who: string; from: number; target: [number, number] }
const wakeOf = (s: Scene) => s.data as unknown as Wake;

export function cannotAwaken(w: World, c: Character): string | null {
  if (!c.resonance || (c.resonance.band !== 'bluewake' && c.resonance.band !== 'ambercore')) return 'Only latent (Bluewake) or settled (Ambercore) resonance can be guided further.';
  if (c.flags.some((f) => f.id === 'wounded')) return 'Not while they are hurt.';
  if (c.flags.some((f) => f.id === 'awakened' || (f.id === 'strained' && f.until && (f.until.year * 800 + f.until.cycle) > w.date.year * 800 + w.date.cycle))) return 'Too soon after the last attempt.';
  return null;
}

export function startAwakening(w: World, personId: string): Scene {
  const c = w.characters[personId]!;
  const hard = c.resonance!.band === 'ambercore';
  return startScene(w, {
    kind: 'awakening', title: `${displayName(c.name)}'s awakening`, eyebrow: 'Resonance', where: 'the quiet room', maxSteps: 5, meter: -100,
    meterLabels: ['cold', 'burning'], ours: [c.id], theirs: [{ name: `${c.resonance!.band} · ${c.resonance!.type} · ${Math.round(c.resonance!.degrees)}°S` }],
    data: { who: c.id, from: c.resonance!.degrees, target: hard ? [30, 70] : [20, 75] } as unknown as Record<string, unknown>, leaveTo: c.id,
    intro: `${shortName(c.name)} sits with their eyes closed. The aim is to let the strain rise into the band and hold it there, not past it.`,
  });
}

registerScene('awakening', {
  refresh(w, s) {
    const k = wakeOf(s);
    const c = w.characters[k.who]!;
    const hard = c.resonance!.band === 'ambercore' ? 3 : 0;
    s.prompt = `The strain is at ${Math.round(s.meter)}. It needs to finish between ${k.target[0]} and ${k.target[1]}; past 100 it burns.`;
    s.options = [
      { key: 'breathe', label: 'Breathe and hold', hint: 'composure + discipline: steady', odds: odds(c, ['composure', 'discipline'], 11 + hard) },
      { key: 'push', label: 'Push into it', hint: 'determination + willpower: a lot, fast', odds: odds(c, ['determination', 'willpower'], 13 + hard) },
      c.resonance!.type === 'gravitic'
        ? { key: 'anchor', label: 'Feel the weight of things', hint: 'willpower + endurance', odds: odds(c, ['willpower', 'endurance'], 12 + hard) }
        : { key: 'listen', label: 'Listen to the minds around them', hint: 'insight + perception', odds: odds(c, ['insight', 'perception'], 12 + hard) },
      { key: 'ease', label: 'Ease off' },
    ];
  },
  act(w, s, key, rng) {
    const k = wakeOf(s);
    const c = w.characters[k.who]!;
    const hard = c.resonance!.band === 'ambercore' ? 3 : 0;
    const go = (stats: Parameters<typeof test>[2], dc: number, ok: number, bad: number, lines: [string, string]) => {
      const t = test(rng, c, stats, dc);
      s.meter = clamp(s.meter + (t.ok ? ok : bad), -100, 140);
      say(s, t.ok ? lines[0] : lines[1], t.ok ? 'good' : 'bad');
    };
    if (key === 'breathe') go(['composure', 'discipline'], 11 + hard, 22, 40, ['It rises evenly.', 'It lurches.']);
    if (key === 'push') go(['determination', 'willpower'], 13 + hard, 45, 70, ['It surges, and they ride it.', 'It surges past them.']);
    if (key === 'anchor' || key === 'listen') go(key === 'anchor' ? ['willpower', 'endurance'] : ['insight', 'perception'], 12 + hard, 30, 10, ['Something in them answers the world back.', 'Nothing answers.']);
    if (key === 'ease') { s.meter = clamp(s.meter - 25, -100, 140); say(s, 'They let it fall back.'); }
    s.meter = clamp(s.meter + 6, -100, 140);
    if (s.meter > 100) { end(w, s, false, `It burns. ${shortName(c.name)} cries out and the room goes white.`, rng); return; }
    if (s.step >= s.maxSteps) { const ok = s.meter >= k.target[0] && s.meter <= k.target[1]; end(w, s, ok, ok ? 'It settles where it should. Something has woken.' : 'It falls back to where it was.', rng); }
  },
  auto(_w, s) {
    const k = wakeOf(s);
    if (s.meter > k.target[1] - 10) return 'ease';
    if (s.meter < k.target[0] - 50 && s.step < 3) return 'push';
    return 'breathe';
  },
  finish(w, s, rng) {
    const k = wakeOf(s);
    const c = w.characters[k.who];
    if (!c?.resonance) return;
    const res = c.resonance;
    if (s.result?.good) {
      const was = res.band;
      res.degrees = was === 'bluewake' ? 120 + rng.int(0, 50) : 250 + rng.int(0, 40);
      res.band = bandFor(res.degrees);
      c.stats.resonanceControl = clamp(c.stats.resonanceControl + 1, 1, 20);
      c.flags.push({ id: 'awakened', since: w.date, detail: `${was} to ${res.band}` });
      logRecord(w, { kind: 'world', type: 'world', severity: 2, text: `${displayName(c.name)}'s resonance wakes: ${was} to ${res.band}, ${Math.round(res.degrees)}°S.`, who: [{ id: c.id, part: 'awakened' }] });
    } else if (s.meter > 100) {
      c.flags.push({ id: 'wounded', since: w.date, until: { year: w.date.year, cycle: Math.min(799, w.date.cycle + 32) } });
      res.degrees += 8;
      c.flags.push({ id: 'strained', since: w.date, until: { year: w.date.year + 1, cycle: w.date.cycle } });
      if (rng.chance(0.3)) addThread(w, c.id, 'omen', 'Burned in an awakening; something else was listening');
    } else c.flags.push({ id: 'strained', since: w.date, until: { year: w.date.year, cycle: Math.min(799, w.date.cycle + 200) } });
  },
});

/** A legend's Caige recovered: it comes with its old bearer inside it. */
export function recoverLegendCaige(w: World, rng: Rng, legendId: string, houseId: string): Caige | null {
  const l = w.archon?.legends.find((x) => x.id === legendId);
  const home = w.houses[houseId];
  if (!l || !home || l.found) return null;
  const cg: Caige = {
    id: `cg${w.nextId++}`, name: l.name, type: rng.pick(['magnetic', 'gravitic', 'drift'] as const), band: rng.pick(['ambercore', 'redline', 'redline', 'whitebreak'] as const),
    houseId, found: w.date, foundAt: { planetId: home.capitalPlanetId, sectorId: w.planets[home.capitalPlanetId]!.sectors[0]!.id }, stability: 55,
  };
  w.armoury[cg.id] = cg;
  ensureCaigeDepth(w);
  cg.souls!.unshift({ name: `the last bearer of ${l.name}`, will: 15 + rng.int(0, 4), virtue: rng.pick(['proud', 'faithful', 'restless'] as const), ...(rng.chance(0.3) ? { unbreakable: true, form: l.form } : {}) });
  storeInVault(w, cg);
  l.found = w.date.year;
  return cg;
}

export { nameOf };
