// Stories on the newer systems: war's aftermath (the widow, the plunder, the champion, the hostage), the
// Numarade (whispers, a bought election, the Exarchon's errand, a seat out of reach), lost Caiges (a map,
// the other claimant), the houses we founded and the houses sworn to us, the Caige's deeper life (a second
// form, the voice of an unbreakable soul), captives who would turn, the year's-end feast, and the Exchange
// (a forward contract, the Steward's venture, smugglers in a shortage).
import type { Rng } from './rng';
import { addEvents, addVariants, choose, fireStage, type Ctx, type EventDef } from './events';
import { econ, record } from './economy';
import { full, nm, seat, highroy, athome, knights, fighters, stranger, data, need, best, toBattle, fought, hasFlag } from './arckit';
import { warsOf, sideOf, formationsOf, vassalsOf, type War } from './war';
import { houseName, liveHouses, regardOf, shiftRegard, seated, exarchonOf } from './archon';
import { shockMult } from './arcs_economy';
import { takeIntoHouse } from './training';
import { shiftOpinion } from './relationships';
import { scaled } from './variants';
import { addCycles, CYCLES_PER_ORBIT, CYCLES_PER_YEAR, absoluteCycle } from './time';
import { RESOURCE_LABEL, type Good } from '../data/economy';
import type { Caige, Character, World } from './types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (c: Ctx, id?: string) => `House ${houseName(c.world, id ?? '')}`;
const amt = (c: Ctx, k = 'amt') => Number(c.arc?.data?.[k] ?? c.memo?.[k] ?? 0);
const str = (c: Ctx, k: string) => String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '');
const at = (c: Ctx, k: string) => c.world.characters[str(c, k)];
const has = (x: Character | undefined, t: string) => !!x?.traits.some((y) => y.id === t);
const year = (c: Ctx) => c.world.date.year;
/** Flags kept on things the stories touch, so the same story does not come twice for the same thing. */
const marked = (o: object, k: string) => !!(o as Record<string, unknown>)[`told_${k}`];
const mark = (o: object, k: string) => { (o as Record<string, unknown>)[`told_${k}`] = true; };

// ---------------------------------------------------------------- war's aftermath

/** A war of ours that ended lately (within a year), and how it went for us. */
function lateWar(c: Ctx, won?: boolean): War | undefined {
  return (c.world.war?.wars ?? []).filter((x) => x.status === 'ended' && x.result && sideOf(x, c.house) && year(c) - x.result.date.year <= 1)
    .find((x) => won === undefined || (x.result!.winner === sideOf(x, c.house)) === won);
}
const ourWar = (c: Ctx): War | undefined => warsOf(c.world, c.house).find((x) => x.id === str(c, 'war')) ?? warsOf(c.world, c.house)[0];
const foeOf = (c: Ctx, war: War) => (sideOf(war, c.house) === 'attackers' ? war.defender : war.attacker);

const war: EventDef[] = [
  {
    id: 'sys:widow', title: 'A widow at court', category: 'War', trigger: 'home', weight: 1.5,
    setup: (c) => { const w = warsOf(c.world, c.house).find((x) => (x.losses[c.house] ?? 0) > 200) ?? lateWar(c); if (!w || marked(w, 'widow')) return false; mark(w, 'widow'); const p = stranger(c); data(c).widow = p.id; data(c).war = w.id; data(c).amt = scaled(c, 250); return true; },
    text: (c) => { const w = (c.world.war?.wars ?? []).find((x) => x.id === str(c, 'war')); return `${full(at(c, 'widow'))} has walked from the lower city to the hall with three children. Her husband died in ${w?.name ?? 'the war'}, in our colours, and the pension the Steward promised has not come. She has not come to beg; she has come to ask why.`; },
    options: [
      { label: 'Pay her pension, and more', labelFor: (c) => `Pay her, and more (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).honour(2).respect(1).say('The hall saw it; the barracks will hear of it'); for (const f of formationsOf(c.world, c.house)) f.morale = clamp(f.morale + 3, 0, 100); } },
      { label: 'Take her children into the household', hint: 'they will grow up ours', resolve: (c) => { const kid = stranger(c, { young: true }); kid.name.family = at(c, 'widow')?.name.family ?? kid.name.family; takeIntoHouse(c.world, kid, 'Youngling'); c.fx.honour(3).say(`${nm(kid)}, the eldest, is taken in to be raised at court`); } },
      { label: 'The war needed him', hint: 'say so, and nothing more', resolve: (c) => { c.fx.respect(-1).dread(1); for (const f of formationsOf(c.world, c.house)) f.morale = clamp(f.morale - 3, 0, 100); } },
    ],
    fallback: 0,
  },
  {
    id: 'sys:plunder', title: 'Plunder', category: 'War', trigger: 'home', weight: 2,
    setup: (c) => { const w = lateWar(c, true); if (!w || marked(w, 'plunder')) return false; mark(w, 'plunder'); data(c).war = w.id; choose(c, { otherHouseId: foeOf(c, w) }); data(c).amt = scaled(c, 900); return true; },
    text: (c) => `The war with ${H(c, c.other)} is won, and our soldiers stand in their storehouses and shrines. The Grand Master reckons ${fmt(amt(c) * 2)} othes in goods and relics, if we take it all. The soldiers think a share is theirs by right.`,
    options: [
      { label: 'The soldiers take their share', hint: 'half to them, half to us', resolve: (c) => { c.fx.othes(amt(c)).honour(-2).regard(c.other, -8); for (const f of formationsOf(c.world, c.house)) f.morale = clamp(f.morale + 10, 0, 100); } },
      { label: 'All of it to the treasury', resolve: (c) => { c.fx.othes(amt(c) * 2).honour(-3).regard(c.other, -12); for (const f of formationsOf(c.world, c.house)) f.morale = clamp(f.morale - 6, 0, 100); c.fx.say('The soldiers grumble at the loading'); } },
      { label: 'Forbid it', hint: 'we came for terms, not loot', resolve: (c) => { c.fx.honour(4).regard(c.other, 10).say(`${H(c, c.other)} will remember what we left`); } },
    ],
    fallback: 0,
  },
  {
    id: 'sys:champion', title: 'A champion\'s challenge', arc: 'The champion', category: 'War', trigger: 'home', weight: 2, urgent: true,
    setup: (c) => {
      const w = warsOf(c.world, c.house).find((x) => x.rung === 'war' && x.fronts.some((f) => !f.ended && !f.battle));
      if (!w || !fighters(c).length) return false;
      const foe = foeOf(c, w);
      const theirs = Object.values(c.world.characters).filter((x) => x.alive && x.houseId === foe && hasFlag(x, 'knighted'));
      const champ = theirs.length ? best(theirs, (x) => x.stats.duelling + x.stats.valor) : undefined;
      data(c).war = w.id; data(c).front = w.fronts.find((f) => !f.ended && !f.battle)!.id;
      if (champ) data(c).champ = champ.id; else data(c).champName = c.rng.pick(['Oszar the Unbowed', 'Kael Ravensworn', 'Ilda of the Ninth Gate', 'Thorne Vasrell', 'Merek Half-Hand']);
      data(c).power = champ ? 0 : c.rng.int(13, 18);
      return choose(c, { otherHouseId: foe });
    },
    text: (c) => { const w = ourWar(c); const fr = w?.fronts.find((f) => f.id === str(c, 'front')); return `On ${fr?.where ?? 'the front'}, ${at(c, 'champ') ? full(at(c, 'champ')) : str(c, 'champName')} of ${H(c, c.other)} has ridden out between the lines and called for our best. Whoever wins, the other side's soldiers will not forget it.`; },
    options: [
      {
        label: 'Send our best', labelFor: (c) => `Send ${nm(best(fighters(c), (x) => x.stats.duelling + x.stats.valor))}`, hint: '⚔ a duel',
        resolve: (c) => {
          const ours = best(fighters(c), (x) => x.stats.duelling + x.stats.valor)!;
          const ch = at(c, 'champ');
          const name = ch ? nm(ch) : str(c, 'champName');
          toBattle(c, { title: `${nm(ours)} against ${name}`, theatre: 'surface', where: 'between the lines', ours: [ours], foes: [ch ? { key: ch.id, id: ch.id, name, champion: true } : { key: 'champ', name, power: amt(c, 'power'), champion: true }], foeName: name, foeCommander: { id: ch?.id, name, skill: 10 }, mass: 2, foeMass: 2, foeHouse: c.other });
        },
        then: () => ({ next: 'sys:champion2', after: 1 }),
      },
      { label: 'Refuse the challenge', hint: 'the soldiers will see it', resolve: (c) => { c.fx.respect(-3); const w = ourWar(c); const fr = w?.fronts.find((f) => f.id === str(c, 'front')); if (w && fr) fr.meter += (sideOf(w, c.house) === 'attackers' ? -1 : 1) * 8; for (const f of formationsOf(c.world, c.house)) f.morale = clamp(f.morale - 5, 0, 100); } },
      { label: 'Shoot the champion from cover', hint: 'Spymaster; no honour in it', check: { who: (c) => seat(c, 'spymaster'), stats: ['marksmanship', 'stealth'], dc: 14 },
        resolve: (c, ok) => { c.fx.honour(-5); const ch = at(c, 'champ'); if (ok) { if (ch) { ch.alive = false; } c.fx.say('The champion falls before the duel begins').regard(c.other, -20).dread(3); } else c.fx.say('The shot misses, and everyone saw where it came from').respect(-4).regard(c.other, -10); } },
    ],
    fallback: 1,
  },
  {
    id: 'sys:champion2', title: 'After the duel', category: 'War', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => { const f = fought(c)!; return f.won ? 'Our champion stands over theirs, and a cheer goes down our line that their soldiers can hear. The front shifts that same day.' : f.fell.length ? `${nm(f.fell[0])} is dead between the lines, and their soldiers are singing.` : 'Our champion lost, and walked back alive. Their soldiers are singing.'; },
    options: [{ label: 'So it goes', resolve: (c) => {
      const f = fought(c)!; const w = ourWar(c); const fr = w?.fronts.find((x) => x.id === str(c, 'front'));
      const sign = w && sideOf(w, c.house) === 'attackers' ? 1 : -1;
      if (w && fr) { fr.meter = clamp(fr.meter + sign * (f.won ? 25 : -15), -100, 100); w.score = clamp(w.score + sign * (f.won ? 6 : -4), -100, 100); }
      for (const x of formationsOf(c.world, c.house)) x.morale = clamp(x.morale + (f.won ? 10 : -8), 0, 100);
      c.fx.respect(f.won ? 3 : -1);
    } }],
    fallback: 0,
  },
  {
    id: 'sys:hostage', title: 'The hostage at our table', arc: 'The hostage', category: 'War', trigger: 'home', weight: 1.5,
    setup: (c) => { const h = (c.world.war?.hostages ?? []).find((x) => x.heldBy === c.house && x.personId && c.world.characters[x.personId]?.alive && !marked(x, 'table')); if (!h) return false; mark(h, 'table'); return choose(c, { personId: h.personId, otherHouseId: h.from }); },
    text: (c) => `${full(c.person)}, of ${H(c, c.other)}, has been our hostage since the war. They eat at our table and are watched at every door. The court is asking how they are to be kept.`,
    options: [
      { label: 'As an honoured guest', hint: 'their house will hear of it', resolve: (c) => { c.fx.regard(c.other, 8).mood(c.person, 12).honour(1); }, then: (c) => ({ next: 'sys:hostage2', after: c.rng.int(CYCLES_PER_YEAR, CYCLES_PER_YEAR * 2) }) },
      { label: 'Under guard, and no more', resolve: (c) => { c.fx.mood(c.person, -4); } },
      { label: 'Raise them as one of ours', hint: 'teachers, a tutor, our ways', resolve: (c) => { c.fx.mood(c.person, 6).regard(c.other, -4); if (c.person) c.person.hidden.loyalty = clamp(c.person.hidden.loyalty + 4, 0, 20); }, then: (c) => ({ next: 'sys:hostage2', after: c.rng.int(CYCLES_PER_YEAR, CYCLES_PER_YEAR * 2) }) },
    ],
    fallback: 1,
  },
  {
    id: 'sys:hostage2', title: 'Whose house?', category: 'War', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} has grown up among us. Their house wants them home; they have asked, quietly, to stay. Whatever we decide, someone will be hurt.`,
    options: [
      { label: 'Let them stay, as ours', resolve: (c) => { const p = c.person!; c.world.war!.hostages = c.world.war!.hostages.filter((x) => x.personId !== p.id); takeIntoHouse(c.world, p, 'Courtier'); c.fx.regard(c.other, -15).say(`${nm(p)} takes our name`); }, ending: 'They stayed.' },
      { label: 'Send them home with gifts', resolve: (c) => { const p = c.person!; c.world.war!.hostages = c.world.war!.hostages.filter((x) => x.personId !== p.id); c.fx.regard(c.other, 15).honour(2).thread(p, 'favour', `Sent home from our court with gifts, and owes us for it`); }, ending: 'Sent home a friend.' },
      { label: 'Keep them: the terms stand', resolve: (c) => { c.fx.mood(c.person, -10).thread(c.person, 'grudge', 'Kept a hostage after asking to stay'); }, ending: 'Kept.' },
    ],
    fallback: 2,
  },
];

// ---------------------------------------------------------------- the Numarade

const capanna = (c: Ctx) => c.world.archon?.numarade.capanna ?? [];
const electing = (c: Ctx) => c.world.archon?.numarade.motions.find((m) => m.status === 'open' && m.kind === 'elect');

const numarade: EventDef[] = [
  {
    id: 'sys:whispers', title: 'Whispers in the Capanna', category: 'Numarade', trigger: 'home', weight: 1.5,
    setup: (c) => {
      if (!capanna(c).length || !exarchonOf(c.world)) return false;
      const who = c.rng.pick(capanna(c));
      const target = c.rng.pick(liveHouses(c.world).filter((h) => h.id !== c.house && h.id !== who.houseId && seated(c.world, h.id)));
      if (!target) return false;
      data(c).who = who.name; data(c).role = who.role; data(c).from = who.houseId; data(c).amt = scaled(c, 400);
      return choose(c, { otherHouseId: target.id });
    },
    text: (c) => `${str(c, 'who')}, ${str(c, 'role')} of the Capanna, let something slip at supper: the Exarchon means to table a censure against ${H(c, c.other)} before the next session. ${H(c, c.other)} does not know.`,
    options: [
      { label: 'Warn them', hint: 'a friend for later', resolve: (c) => { c.fx.regard(c.other, 12).say(`${H(c, c.other)} is grateful`); shiftRegard(c.world, exarchonOf(c.world)!.houseId, c.house, -4); } },
      { label: 'Use it ourselves', hint: 'stand with the Exarchon early', resolve: (c) => { shiftRegard(c.world, exarchonOf(c.world)!.houseId, c.house, 8); c.fx.regard(c.other, -4).respect(1); } },
      { label: 'Sell it', labelFor: (c) => `Sell it (${fmt(amt(c))})`, hint: 'to whoever pays', resolve: (c) => { c.fx.othes(amt(c)).honour(-2); if (c.rng.chance(0.3)) { c.fx.say(`${str(c, 'who')} learns where it went`).regard(str(c, 'from'), -10); } } },
    ],
    fallback: 1,
  },
  {
    id: 'sys:bribe', title: 'Buying the chair', category: 'Numarade', trigger: 'home', weight: 3,
    setup: (c) => { const m = electing(c); if (!m || !seated(c.world, c.house) || marked(m, 'bribe')) return false; mark(m, 'bribe'); data(c).motion = m.id; data(c).amt = scaled(c, 2500); return true; },
    text: (c) => { const m = electing(c); const ours = m?.candidates?.find((x) => x.houseId === c.house); return `The Numarade is choosing an Exarchon. ${nm(seat(c, 'envoy'))} says three seats are for sale, quietly, for ${fmt(amt(c))} othes between them, ${ours ? `and that ${ours.name} could carry it with them` : 'and that the right candidate could carry it with them'}.`; },
    options: [
      { label: 'Buy them', labelFor: (c) => `Buy the seats (${fmt(amt(c))})`, hint: 'if it comes out, it is a scandal', available: (c) => need(amt(c))(c),
        resolve: (c) => {
          const m = c.world.archon!.numarade.motions.find((x) => x.id === str(c, 'motion'));
          c.fx.othes(-amt(c));
          if (m?.candidates?.length) { const idx = m.candidates.findIndex((x) => x.houseId === c.house); m.swingFor = idx >= 0 ? idx : m.candidates.map((x, i) => ({ i, r: regardOf(c.world, x.houseId, c.house) })).sort((a, b) => b.r - a.r)[0]!.i; m.swing = (m.swing ?? 0) + 2; }
          if (c.rng.chance(0.25)) c.fx.say('It comes out. The chamber is disgusted').honour(-6).respect(-3); else c.fx.say('Three seats will vote as they were paid to');
        } },
      { label: 'Lobby honestly', hint: 'Speaker', check: { who: (c) => seat(c, 'envoy'), stats: ['diplomacy', 'eloquence'], dc: 13 },
        resolve: (c, ok) => { const m = c.world.archon!.numarade.motions.find((x) => x.id === str(c, 'motion')); if (ok && m?.candidates?.length) { const idx = m.candidates.findIndex((x) => x.houseId === c.house); m.swingFor = idx >= 0 ? idx : 0; m.swing = (m.swing ?? 0) + 1; c.fx.say('One seat comes over'); } else c.fx.say('No one is moved'); } },
      { label: 'Report the sale to the chamber', resolve: (c) => { c.fx.honour(3).say('The sellers will not forgive it'); } },
    ],
    fallback: 2,
  },
  {
    id: 'sys:errand', title: 'The Exarchon\'s favour', arc: 'The Exarchon\'s errand', category: 'Numarade', trigger: 'home', weight: 1.5,
    setup: (c) => { const ex = exarchonOf(c.world); if (!ex || ex.houseId === c.house || !knights(c).length) return false; data(c).task = c.rng.pick(['escort', 'collect', 'quiet']); return choose(c, { otherHouseId: ex.houseId, personId: c.rng.pick(knights(c)).id }); },
    text: (c) => { const ex = exarchonOf(c.world); const t = str(c, 'task'); return `The Exarchon, ${ex?.name ?? 'the chair'}, asks a service of our house, privately: ${t === 'escort' ? `an escort for a delegation through the Silent Belt, and asks for ${full(c.person)} by name` : t === 'collect' ? `that ${full(c.person)} collect a debt from a minor house that has stopped answering letters` : `that ${full(c.person)} make a certain witness forget what they saw at the last session`}.`; },
    options: [
      { label: 'Do it', labelFor: (c) => `Send ${nm(c.person)}`, check: { who: (c) => c.person, stats: ['duelling', 'leadership'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.regard(c.other, 14).respect(1).say('It is done, and the Exarchon owes us'); else c.fx.regard(c.other, 4).wound(c.person).say('It is done, badly'); if (str(c, 'task') === 'quiet') c.fx.honour(-3); } },
      { label: 'Ask for something in return first', hint: 'Speaker', check: { who: (c) => seat(c, 'envoy'), stats: ['negotiation', 'diplomacy'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.othes(scaled(c, 600)).regard(c.other, 6).say('The Exarchon pays, and remembers we asked'); else c.fx.regard(c.other, -6).say('The Exarchon withdraws the request, coldly'); } },
      { label: 'Decline, politely', resolve: (c) => { c.fx.regard(c.other, -6); } },
    ],
    fallback: 2,
  },
  {
    id: 'sys:outside', title: 'Outside the chamber', category: 'Numarade', trigger: 'home', weight: 1,
    setup: (c) => { const a = c.world.archon; if (!a || seated(c.world, c.house)) return false; const low = Math.min(...a.numarade.seats.map((s) => a.houses[s]?.prestige ?? 100)); return (a.houses[c.house]?.prestige ?? 0) >= low - 5; },
    text: (c) => `Our house stands as high as any seated in the Numarade, and still has no seat. ${nm(seat(c, 'envoy'))} says the seated houses like it that way, and that the next election will be the same unless we do something about it.`,
    options: [
      { label: 'Court the seated houses', hint: 'Speaker', check: { who: (c) => seat(c, 'envoy'), stats: ['diplomacy', 'eloquence'], dc: 12 },
        resolve: (c, ok) => { const seats = c.rng.shuffle([...(c.world.archon?.numarade.seats ?? [])]).slice(0, ok ? 3 : 1); for (const s of seats) shiftRegard(c.world, s, c.house, ok ? 8 : 3); c.fx.say(`${seats.length} seated house${seats.length === 1 ? '' : 's'} warm to us`); } },
      { label: 'Say it out loud', hint: 'respect, and some enemies', resolve: (c) => { c.fx.respect(3); const ex = exarchonOf(c.world); if (ex) shiftRegard(c.world, ex.houseId, c.house, -8); } },
      { label: 'Bide our time', resolve: (c) => { c.fx.say('We wait'); } },
    ],
    fallback: 2,
  },
];

// ---------------------------------------------------------------- lost Caiges

const unfound = (c: Ctx) => (c.world.archon?.legends ?? []).filter((l) => !l.found);
const legend = (c: Ctx) => c.world.archon?.legends.find((l) => l.id === str(c, 'legend'));

const caiges: EventDef[] = [
  {
    id: 'sys:map', title: 'A map to a lost Caige', category: 'Resonance', trigger: 'home', weight: 1.2,
    setup: (c) => { const ls = unfound(c).filter((l) => !marked(l, 'map')); if (!ls.length) return false; const l = c.rng.pick(ls); data(c).legend = l.id; data(c).amt = scaled(c, 800); data(c).real = c.rng.chance(0.65) ? 1 : 0; return true; },
    text: (c) => { const l = legend(c); return `A dealer in old charts says he has the way to ${l?.name}, the Caige lost by House ${houseName(c.world, l?.house ?? '')} in ${l?.year}: not just where it was last seen (${l?.where}), but the safe road in. He wants ${fmt(amt(c))} othes.`; },
    options: [
      { label: 'Buy it', labelFor: (c) => `Buy it (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)); const l = legend(c); if (l && amt(c, 'real')) { mark(l, 'map'); c.fx.say('The chart is real. Whoever goes after it will go in knowing the way'); } else c.fx.say('The chart is a fake, and the dealer is gone'); } },
      { label: 'Have the Spymaster look first', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intellect'], dc: 12 },
        resolve: (c, ok) => { const l = legend(c); if (!ok) { c.fx.say('The Spymaster cannot tell, and the dealer walks'); return; } if (amt(c, 'real') && l) { c.fx.othes(-Math.min(amt(c), Math.max(0, econ(c.world, c.house).stock.othes))); mark(l, 'map'); c.fx.say('It is real; we buy it'); } else c.fx.say('A fake, and we know it'); } },
      { label: 'Pass', resolve: (c) => { c.fx.say('The chart goes to someone else'); } },
    ],
    fallback: 2,
  },
  {
    id: 'sys:claimant', title: 'The other claimant', category: 'Resonance', trigger: 'home', weight: 3,
    setup: (c) => {
      const l = (c.world.archon?.legends ?? []).find((x) => x.found && !marked(x, 'claim') && x.house !== c.house && !c.world.archon?.houses[x.house]?.ended && Object.values(c.world.armoury).some((g) => g.houseId === c.house && g.name === x.name));
      if (!l) return false; mark(l, 'claim'); data(c).legend = l.id; data(c).amt = scaled(c, 2000);
      return choose(c, { otherHouseId: l.house });
    },
    text: (c) => { const l = legend(c); return `${H(c, c.other)} has heard that ${l?.name} is in our vault. It was theirs, they say, before it was lost in ${l?.year}, and the bearer inside it was of their blood. They want it back.`; },
    options: [
      { label: 'Give it back', hint: 'a great deal of honour', resolve: (c) => { const l = legend(c); const cg = Object.values(c.world.armoury).find((g) => g.houseId === c.house && g.name === l?.name); if (cg) giveCaige(c.world, cg, c.other!); c.fx.honour(6).regard(c.other, 25).say(`${l?.name} goes home to ${H(c, c.other)}`); } },
      { label: 'Offer them compensation', labelFor: (c) => `Offer compensation (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).regard(c.other, 4).say('They take the money, and do not forget'); } },
      { label: 'Refuse: it was lost, and we found it', resolve: (c) => { c.fx.regard(c.other, -18).respect(1); } },
    ],
    fallback: 2,
  },
];

function giveCaige(w: World, cg: Caige, to: string): void {
  if (cg.bondedTo) { const b = w.characters[cg.bondedTo]; if (b) b.flags = b.flags.filter((f) => f.id !== 'caigeBonded'); cg.bondedTo = undefined; }
  if (w.houses[to]) { cg.houseId = to; cg.vaultId = undefined; } else delete w.armoury[cg.id];
}

// ---------------------------------------------------------------- founded houses and vassals

const founded = (c: Ctx) => liveHouses(c.world).filter((h) => h.foundedBy && c.world.war?.liege[h.id] === c.house);

const realm: EventDef[] = [
  {
    id: 'sys:letter', title: 'The founder writes home', category: 'Realm', trigger: 'home', weight: 2,
    setup: (c) => { const fs = founded(c); if (!fs.length) return false; const h = c.rng.pick(fs); data(c).need = c.rng.pick(['coin', 'people', 'ship']); data(c).amt = scaled(c, 900); return choose(c, { otherHouseId: h.id }); },
    text: (c) => { const h = c.world.archon?.houses[c.other ?? '']; const n = str(c, 'need'); return `A letter from ${h?.foundedBy ?? 'the founder'}, of House ${h?.name}, who left us to raise a house on the frontier: ${n === 'coin' ? `the first harvest failed, and they need ${fmt(amt(c))} othes to see the colony through the cold Orbits` : n === 'people' ? 'they have land and no one to work it, and ask if any of our people would come' : 'corsairs have found them, and they ask for a warship to sit in their sky for a season'}.`; },
    options: [
      { label: 'Send what they ask', labelFor: (c) => (str(c, 'need') === 'coin' ? `Send it (${fmt(amt(c))})` : str(c, 'need') === 'people' ? 'Send settlers' : 'Send a warship'),
        available: (c) => (str(c, 'need') === 'coin' ? need(amt(c))(c) : null),
        resolve: (c) => { const h = c.world.archon!.houses[c.other!]!; if (str(c, 'need') === 'coin') c.fx.othes(-amt(c)); else if (str(c, 'need') === 'people') c.fx.say('A hundred families take ship for the frontier'); else c.fx.say('A warship sits in their sky for the season'); h.prestige = clamp(h.prestige + 3, 0, 100); h.might = Math.round((h.might + 0.05) * 100) / 100; c.fx.regard(c.other, 12).honour(1); } },
      { label: 'Send half', resolve: (c) => { if (str(c, 'need') === 'coin') c.fx.othes(-Math.round(amt(c) / 2)); c.fx.regard(c.other, 4); } },
      { label: 'They must stand on their own', resolve: (c) => { c.fx.regard(c.other, -8); const h = c.world.archon!.houses[c.other!]!; h.prestige = clamp(h.prestige - 2, 0, 100); } },
    ],
    fallback: 1,
  },
  {
    id: 'sys:insolence', title: 'A vassal\'s insolence', category: 'Realm', trigger: 'home', weight: 2,
    setup: (c) => { const vs = vassalsOf(c.world, c.house).filter((v) => regardOf(c.world, v, c.house) < 30); if (!vs.length) return false; const v = c.rng.pick(vs); data(c).amt = Math.round(1000 + (c.world.archon?.houses[v]?.might ?? 1) * 1500); return choose(c, { otherHouseId: v }); },
    text: (c) => `${H(c, c.other)}, sworn to us, has written to say that next year's tribute of ${fmt(amt(c))} othes will not come. Times are hard, they say. Their envoy said it standing, without bowing.`,
    options: [
      { label: 'Send the fleet to collect', hint: 'they pay; they hate it', resolve: (c) => { c.fx.othes(-scaled(c, 300)).dread(3).regard(c.other, -12).say('They pay, under our guns'); } },
      { label: 'Excuse them this once', resolve: (c) => { const s = c.world.war!; (s as typeof s & { excused?: Record<string, number> }).excused = { ...((s as typeof s & { excused?: Record<string, number> }).excused ?? {}), [c.other!]: year(c) + 1 }; c.fx.regard(c.other, 10).honour(1).respect(-1); } },
      { label: 'Release them from their oath', hint: 'a friend, not a vassal', resolve: (c) => { delete c.world.war!.liege[c.other!]; c.fx.regard(c.other, 20).honour(2).respect(-2).say(`${H(c, c.other)} is sworn to no one`); } },
    ],
    fallback: 0,
  },
  {
    id: 'sys:fealty', title: 'Fealty offered', category: 'Realm', trigger: 'home', weight: 1,
    setup: (c) => { const weak = liveHouses(c.world).filter((h) => h.id !== c.house && !c.world.houses[h.id] && h.tier === 'minor' && h.prestige < 30 && !c.world.war?.liege[h.id] && regardOf(c.world, h.id, c.house) >= 0 && !vassalsOf(c.world, h.id).length); if (!weak.length) return false; return choose(c, { otherHouseId: c.rng.pick(weak).id }); },
    text: (c) => `${H(c, c.other)}, a small house with enemies larger than itself, sends its heir to kneel in our hall. They offer their fealty: tribute every year, and their vote with ours. In return, our protection.`,
    options: [
      { label: 'Accept their oath', hint: 'tribute, and their quarrels', resolve: (c) => { c.world.war!.liege[c.other!] = c.house; shiftRegard(c.world, c.other!, c.house, 15); c.fx.respect(3).say(`${H(c, c.other)} is sworn to us`); } },
      { label: 'Protect them as friends, not vassals', resolve: (c) => { c.fx.regard(c.other, 20).honour(2); } },
      { label: 'Refuse', resolve: (c) => { c.fx.regard(c.other, -6); } },
    ],
    fallback: 2,
  },
];

// ---------------------------------------------------------------- the Caige's deeper life, and captives

const bondedCaige = (c: Ctx, f: (g: Caige) => boolean) => Object.values(c.world.armoury).find((g) => g.houseId === c.house && g.bondedTo && c.world.characters[g.bondedTo]?.alive && f(g));
const caigeOf = (c: Ctx) => c.world.armoury[str(c, 'caige')];

const deeper: EventDef[] = [
  {
    id: 'sys:form', title: 'The second form', category: 'Resonance', trigger: 'home', weight: 2,
    setup: (c) => { const g = bondedCaige(c, (x) => (x.cdi ?? 0) >= 0.6 && (x.forms ?? 1) < 2 && !marked(x, 'form')); if (!g) return false; mark(g, 'form'); data(c).caige = g.id; return choose(c, { personId: g.bondedTo }); },
    text: (c) => { const g = caigeOf(c); return `In the yard this morning, ${g?.name} in ${full(c.person)}'s hand flickered: for a heartbeat it was not ${g?.form ?? 'its usual shape'} but something else. The old bearers say a Caige this coherent can hold a second form, if the bearer can bear it.`; },
    options: [
      { label: 'Push for it', hint: 'the bearer\'s will against the Caige', check: { who: (c) => c.person, stats: ['caigeSync', 'willpower'], dc: 14 },
        resolve: (c, ok) => { const g = caigeOf(c); if (!g) return; if (ok) { g.forms = 2; g.cdi = Math.min(0.99, (g.cdi ?? 0.6) + 0.03); c.fx.respect(2).mood(c.person, 10).say(`${g.name} holds two forms now`); } else { if (c.person && !hasFlag(c.person, 'strained')) c.person.flags.push({ id: 'strained', since: c.world.date }); c.fx.wound(c.person).say('The Caige fights back; the bearer is hurt'); } } },
      { label: 'Let it come in its own time', resolve: (c) => { const g = caigeOf(c); if (g) g.cdi = Math.min(0.99, (g.cdi ?? 0.6) + 0.02); c.fx.say('The bearer trains, and waits'); } },
      { label: 'Forbid it', hint: 'too dangerous', resolve: (c) => { c.fx.mood(c.person, -5); } },
    ],
    fallback: 1,
  },
  {
    id: 'sys:voice', title: 'The voice in the Caige', arc: 'The unbreakable soul', category: 'Resonance', trigger: 'home', weight: 2,
    setup: (c) => { const g = bondedCaige(c, (x) => !!x.souls?.some((s) => s.unbreakable) && !marked(x, 'voice')); if (!g) return false; mark(g, 'voice'); data(c).caige = g.id; return choose(c, { personId: g.bondedTo }); },
    text: (c) => { const g = caigeOf(c); const s = g?.souls?.find((x) => x.unbreakable); return `${full(c.person)} has stopped sleeping. There is someone in ${g?.name} who would not bend at the bonding: ${s?.name}. Now they speak, at night, and ${nm(c.person)} has started answering.`; },
    options: [
      { label: 'Listen to what they want', resolve: (c) => { c.fx.stat(c.person, 'resonanceControl', 1).mood(c.person, -3); if (c.person) c.person.hidden.drift += 1; }, then: (c) => ({ next: 'sys:voice2', after: c.rng.int(80, 160) }) },
      { label: 'Silence them', hint: 'the bond weakens', resolve: (c) => { const g = caigeOf(c); if (g) g.cdi = Math.max(0.05, (g.cdi ?? 0.5) - 0.06); c.fx.mood(c.person, 4).say('The nights are quiet again, and the Caige is duller in the hand'); } },
      { label: 'Bargain with them', check: { who: (c) => c.person, stats: ['willpower', 'composure'], dc: 14 },
        resolve: (c, ok) => { const g = caigeOf(c); if (ok && g) { g.cdi = Math.min(0.99, (g.cdi ?? 0.5) + 0.06); c.fx.thread(c.person, 'vow', `Promised the soul in ${g.name} something it wanted`).say('A bargain is struck'); } else c.fx.mood(c.person, -8).say('The soul laughs at the offer'); } },
    ],
    fallback: 1,
  },
  {
    id: 'sys:voice2', title: 'What the soul wants', category: 'Resonance', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!caigeOf(c),
    text: (c) => { const s = caigeOf(c)?.souls?.find((x) => x.unbreakable); const r = c.world.houses[c.house]; void r; return `${s?.name ?? 'The soul'} has told ${nm(c.person)} what it wants: the name of the house that killed it, ended. ${nm(c.person)} says they can feel the anger in their own hands when they hold the Caige.`; },
    options: [
      { label: 'Give the bearer to it', hint: 'stronger, and less themselves', resolve: (c) => { const g = caigeOf(c); if (g) g.cdi = Math.min(0.99, (g.cdi ?? 0.5) + 0.1); c.fx.stat(c.person, 'duelling', 2).mood(c.person, -10); if (c.person) { c.person.hidden.drift += 3; if (!c.person.traits.some((t) => t.id === 'wrathful')) c.person.traits.push({ id: 'wrathful' }); } }, ending: 'The soul has its way.' },
      { label: 'Take the Caige from them', hint: 'back to the vault', resolve: (c) => { const g = caigeOf(c); if (g && c.person) { g.bondedTo = undefined; c.person.flags = c.person.flags.filter((f) => f.id !== 'caigeBonded'); } c.fx.mood(c.person, -6).say('The bearer gives it up, shaking'); }, ending: 'Unbonded.' },
      { label: 'Hold on', check: { who: (c) => c.person, stats: ['willpower', 'determination'], dc: 15 }, resolve: (c, ok) => { if (ok) { const s = caigeOf(c)?.souls?.find((x) => x.unbreakable); if (s) s.will = Math.max(10, s.will - 6); c.fx.stat(c.person, 'willpower', 1).say('The bearer is master in their own hands'); } else { c.fx.wound(c.person).mood(c.person, -10); } }, ending: 'A truce inside the Caige.' },
    ],
    fallback: 2,
  },
  {
    id: 'sys:turncoat', title: 'The captive would turn', category: 'Intrigue', trigger: 'home', weight: 1.5,
    setup: (c) => { const cap = Object.values(c.world.captives ?? {}).find((x) => x.heldBy === c.house && x.interrogated && c.world.characters[x.characterId]?.alive && !marked(x, 'turn')); if (!cap) return false; mark(cap, 'turn'); const p = c.world.characters[cap.characterId]!; return choose(c, { personId: p.id, otherHouseId: p.houseId }); },
    text: (c) => `${full(c.person)} has been in our cells since the questioning, and has sent word through the gaoler: they will serve us, and tell us everything they did not tell before, if we let them out.`,
    options: [
      { label: 'Take them into our service', hint: 'they may yet be loyal to their own', resolve: (c) => { const p = c.person!; delete c.world.captives[p.id]; takeIntoHouse(c.world, p, 'Agent'); c.fx.learnHouse(c.other, 25).regard(c.other, -10); if ((p.hidden.loyalty ?? 10) > 12) c.fx.thread(p, 'secret', 'Still loyal to the house that bred them'); } },
      { label: 'Get the rest out of them, then decide', hint: 'Spymaster', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 12 },
        resolve: (c, ok) => { c.fx.learnHouse(c.other, ok ? 20 : 5); c.fx.say(ok ? 'Everything, and it checks out' : 'Some of it was true'); } },
      { label: 'No', resolve: (c) => { c.fx.mood(c.person, -10); } },
    ],
    fallback: 2,
  },
];

// ---------------------------------------------------------------- the year's end

const yearEnd: EventDef[] = [
  {
    id: 'sys:feast', title: 'The year\'s-end feast', category: 'Court', trigger: 'home', weight: 0, stage: true,
    setup: (c) => { data(c).amt = scaled(c, 600); return true; },
    text: (c) => `The year turns. The court expects the feast: the long tables, the toasts to the dead, the Highroy's speech. ${nm(seat(c, 'steward'))} says a proper one will cost ${fmt(amt(c))} othes.`,
    options: [
      { label: 'A feast to remember', labelFor: (c) => `A feast to remember (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).respect(2).moodAll(athome(c, true), 5, 'the court'); } },
      { label: 'A modest table', resolve: (c) => { c.fx.othes(-Math.round(amt(c) / 4)).moodAll(athome(c, true), 1, 'the court'); } },
      { label: 'No feast this year', resolve: (c) => { c.fx.moodAll(athome(c, true), -3, 'the court').respect(-1); } },
    ],
    fallback: 1,
  },
];

addVariants('sys:feast', [
  {
    id: 'war', title: 'A feast in wartime', when: (c) => warsOf(c.world, c.house).length > 0,
    text: (c) => `The year turns with the house at war. Some say a feast now is an insult to the soldiers in the field; others say it is exactly what the soldiers need to hear about. ${nm(seat(c, 'steward'))} has costed it at ${fmt(amt(c))} othes.`,
    extra: [{ label: 'Feast with the soldiers instead', hint: 'at the barracks, not the hall', resolve: (c) => { c.fx.othes(-Math.round(amt(c) / 2)).honour(1); for (const f of formationsOf(c.world, c.house)) f.morale = clamp(f.morale + 8, 0, 100); c.fx.say('The Highroy eats with the legion'); } }],
  },
  {
    id: 'mourning', title: 'A feast of the dead', when: (c) => Object.values(c.world.characters).some((x) => !x.alive && x.houseId === c.house && x.death && x.death.date.year === c.world.date.year),
    text: (c) => { const dead = Object.values(c.world.characters).filter((x) => !x.alive && x.houseId === c.house && x.death && x.death.date.year === c.world.date.year); return `The year turns, and the house has lost ${dead.length === 1 ? full(dead[0]) : `${dead.length} of its own`} in it. The feast will be quieter, with an empty chair. ${fmt(amt(c))} othes for the table, if we hold it.`; },
    extra: [{ label: 'An empty chair, and the names read out', resolve: (c) => { c.fx.othes(-Math.round(amt(c) / 3)).honour(2).moodAll(athome(c, true), 3, 'the mourners'); } }],
  },
  {
    id: 'rich', title: 'A feast of plenty', when: (c) => econ(c.world, c.house).stock.othes > 40000,
    text: (c) => `The year turns, and it was a fat one: the coffers are fuller than anyone at court remembers. They expect a feast to match. ${fmt(amt(c) * 3)} othes would do it properly, with half the Archon invited.`,
    extra: [{ label: 'Invite half the Archon', labelFor: (c) => `Invite half the Archon (${fmt(amt(c) * 3)})`, available: (c) => need(amt(c) * 3)(c), resolve: (c) => { c.fx.othes(-amt(c) * 3).respect(4).moodAll(athome(c, true), 6, 'the court'); for (const h of c.rng.shuffle(liveHouses(c.world).filter((x) => x.id !== c.house)).slice(0, 4)) shiftRegard(c.world, h.id, c.house, 5); } }],
  },
]);

// ---------------------------------------------------------------- the Exchange

const GOODS4: Good[] = ['metals', 'fuel', 'components', 'navisium'];
const price = (c: Ctx, g: Good) => c.world.economy.market[g].price;

const exchange: EventDef[] = [
  {
    id: 'sys:forward', title: 'A forward contract', arc: 'The forward contract', category: 'Treasury', trigger: 'home', weight: 1.5,
    setup: (c) => { const g = c.rng.pick(GOODS4); const n = Math.max(10, Math.round(scaled(c, 1500) / price(c, g) / 10) * 10); data(c).good = g; data(c).n = n; data(c).px = Math.round(price(c, g) * (1.05 + c.rng.next() * 0.1) * 100) / 100; return true; },
    text: (c) => { const g = str(c, 'good') as Good; return `A Doven guild factor offers a contract: ${amt(c, 'n')} ${RESOURCE_LABEL[g].toLowerCase()}, delivered in an Orbit, at ${amt(c, 'px')} othes each (today it trades at ${Math.round(price(c, g) * 100) / 100}). If the price falls, we are well paid. If it climbs, we deliver at a loss, and we must deliver either way.`; },
    options: [
      { label: 'Sign', hint: 'deliver in an Orbit', resolve: (c) => c.fx.say('The contract is signed'), then: () => ({ next: 'sys:forward2', after: CYCLES_PER_ORBIT }) },
      { label: 'Sign for half', hint: 'Steward haggles the size', resolve: (c) => { data(c).n = Math.round(amt(c, 'n') / 2); c.fx.say('Half the contract'); }, then: () => ({ next: 'sys:forward2', after: CYCLES_PER_ORBIT }) },
      { label: 'Decline', resolve: (c) => c.fx.say('The factor tries elsewhere') },
    ],
    fallback: 2,
  },
  {
    id: 'sys:forward2', title: 'Delivery day', category: 'Treasury', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!str(c, 'good') && amt(c, 'n') > 0,
    text: (c) => { const g = str(c, 'good') as Good; const have = econ(c.world, c.house).stock[g]; const p = price(c, g); return `The guild factor is back for ${amt(c, 'n')} ${RESOURCE_LABEL[g].toLowerCase()} at ${amt(c, 'px')} each. It trades at ${Math.round(p * 100) / 100} today, ${p > amt(c, 'px') ? 'above our price: this one costs us' : 'below our price: this one pays'}. We hold ${Math.floor(have)}.`; },
    options: [
      { label: 'Deliver', resolve: (c) => {
        const g = str(c, 'good') as Good; const n = amt(c, 'n'); const e = econ(c.world, c.house);
        const short = Math.max(0, n - Math.floor(e.stock[g]));
        const buy = Math.round(short * price(c, g) * 1.1);
        if (short) c.fx.say(`We buy ${short} on the Exchange to make up the load`);
        e.stock[g] = Math.max(0, e.stock[g] - (n - short));
        const paid = Math.round(n * amt(c, 'px'));
        record(c.world, c.house, { resource: 'othes', amount: paid - buy, label: 'A forward contract delivered', kind: 'trade' });
        c.fx.say(`The guild pays ${fmt(paid)}`);
      }, ending: 'Delivered.' },
      { label: 'Default on it', hint: 'the guilds will remember', resolve: (c) => { c.fx.othes(-Math.round(amt(c, 'n') * amt(c, 'px') * 0.2)).respect(-3).say('We pay the penalty and break our word'); }, ending: 'Broken.' },
    ],
    fallback: 0,
  },
  {
    id: 'sys:venture', title: 'The Steward\'s venture', arc: 'The venture', category: 'Treasury', trigger: 'home', weight: 1.2,
    setup: (c) => { const st = seat(c, 'steward'); if (!st) return false; const wilds = Object.values(c.world.archon?.frontier ?? {}); data(c).amt = scaled(c, 1800); data(c).where = wilds.length ? c.rng.pick(wilds).name : 'the Ember Verge'; return choose(c, { personId: st.id }); },
    text: (c) => `${full(c.person)} has a proposal: put ${fmt(amt(c))} othes into a mining venture at ${str(c, 'where')}, with two Doven guilds. In two Orbits it pays back near double, or it does not pay back at all. "I would not bring it to you if I did not believe in it."`,
    options: [
      { label: 'Fund it', labelFor: (c) => `Fund it (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).mood(c.person, 6); }, then: () => ({ next: 'sys:venture2', after: CYCLES_PER_ORBIT * 2 }) },
      { label: 'Fund half', available: (c) => need(Math.round(amt(c) / 2))(c), resolve: (c) => { data(c).amt = Math.round(amt(c) / 2); c.fx.othes(-amt(c)).mood(c.person, 2); }, then: () => ({ next: 'sys:venture2', after: CYCLES_PER_ORBIT * 2 }) },
      { label: 'No', resolve: (c) => { c.fx.mood(c.person, -4); } },
    ],
    fallback: 2,
  },
  {
    id: 'sys:venture2', title: 'What the venture made', category: 'Treasury', trigger: 'home', weight: 0, stage: true,
    setup: (c) => amt(c) > 0 && !!c.person?.alive,
    text: (c) => `Word from ${str(c, 'where')}: the venture ${full(c.person)} talked us into has come to its reckoning.`,
    options: [{ label: 'Read the accounts', check: { who: (c) => c.person, stats: ['logistics', 'negotiation'], dc: 12 },
      resolve: (c, ok) => {
        if (ok && c.rng.chance(0.25)) { const per = Math.round(amt(c) / 20 / 10) * 10; econ(c.world, c.house).boons.push({ id: `b${c.world.nextId++}`, label: `A share in the mines at ${str(c, 'where')}`, flow: { othes: per }, until: addCycles(c.world.date, CYCLES_PER_YEAR * 30) }); c.fx.othes(amt(c)).mood(c.person, 10).say(`It paid back, and a share keeps paying ${per} a Phase`); }
        else if (ok) c.fx.othes(Math.round(amt(c) * 1.8)).mood(c.person, 8).say('Near double, as promised');
        else if (c.rng.chance(0.5)) c.fx.othes(Math.round(amt(c) * 0.5)).mood(c.person, -6).say('Half of it back, and the guilds blame each other');
        else c.fx.mood(c.person, -12).thread(c.person, 'debt', 'Lost the house a fortune on a frontier venture').say('The seam was dry. All of it is gone');
      }, ending: 'The accounts are closed.' }],
    fallback: 0,
  },
  {
    id: 'sys:smugglers', title: 'Fuel off the books', category: 'Treasury', trigger: 'home', weight: 4,
    setup: (c) => { if (shockMult(c.world, 'fuel') < 1.2) return false; data(c).n = Math.round(scaled(c, 1200) / price(c, 'fuel') / 10) * 10 || 20; data(c).px = Math.round(price(c, 'fuel') * 0.6 * 100) / 100; return true; },
    text: (c) => `Fuel costs half again what it did, and a Kessar smuggler has docked at the outer ring with ${amt(c, 'n')} loads he will sell at ${amt(c, 'px')}, no questions. It is almost certainly stolen, and the Numarade has hanged people for less.`,
    options: [
      { label: 'Buy it', labelFor: (c) => `Buy it (${fmt(amt(c, 'n') * amt(c, 'px'))})`, available: (c) => need(Math.round(amt(c, 'n') * amt(c, 'px')))(c),
        resolve: (c) => { c.fx.othes(-Math.round(amt(c, 'n') * amt(c, 'px'))).good('fuel', amt(c, 'n')); if (c.rng.chance(0.2)) c.fx.honour(-4).respect(-2).say('It gets out where we bought it'); } },
      { label: 'Buy it and sell it on', hint: 'Steward', check: { who: (c) => seat(c, 'steward'), stats: ['negotiation', 'deception'], dc: 13 },
        resolve: (c, ok) => { const cost = Math.round(amt(c, 'n') * amt(c, 'px')); if (ok) c.fx.othes(Math.round(amt(c, 'n') * price(c, 'fuel') * 0.9) - cost).say('Bought cheap, sold dear, no one the wiser'); else c.fx.othes(-cost).honour(-5).respect(-2).good('fuel', amt(c, 'n')).say('Caught reselling it'); } },
      { label: 'Report him', resolve: (c) => { c.fx.honour(2).say('The smuggler is taken at the ring'); } },
    ],
    fallback: 2,
  },
];

addEvents([...war, ...numarade, ...caiges, ...realm, ...deeper, ...yearEnd, ...exchange]);

/** Once a year: the feast at the year's end. */
export function yearlyStories(w: World, rng: Rng): void {
  fireStage(w, rng, 'sys:feast', {});
}

void absoluteCycle; void highroy; void has; void shiftOpinion;
