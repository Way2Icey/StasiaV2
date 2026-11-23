// Scenes of the court and the chamber: the Numarade in session, negotiation, audiences and interrogations,
// ceremonies, and the chronicle of the year.
import { Rng } from './rng';
import { registerScene, startScene, say, end, odds, test, clamp, nameOf, once, type Scene } from './scene';
import {
  aiVote, closeMotion, conviction, houseName, liveHouses, onSession, regardOf, shiftRegard, affinity, prestigeOf, type Motion,
} from './archon';
import { endWar, sideOf, GOAL_LABEL, type War, type WarGoal } from './war';
import { seatHolder, ruler } from './query';
import { econ } from './economy';
import { learn } from './knowledge';
import { interrogateInPlace } from './captives';
import { shiftMood } from './mood';
import { shiftOpinion } from './relationships';
import { addThread, openThreads } from './storystate';
import { logRecord } from './records';
import { displayName, shortName } from './names';
import { AMBITION_LABEL } from './ambitions';
import { TRAITS_BY_ID } from '../data/traits';
import type { Character, World } from './types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (p: number) => `${Math.round(p * 100)}%`;
const envoyOf = (w: World) => seatHolder(w, w.playerHouseId, 'envoy');
const spyOf = (w: World) => seatHolder(w, w.playerHouseId, 'spymaster');
const lordOf = (w: World) => ruler(w, w.playerHouseId);

// ================================================================ the Numarade in session

const motionOf = (w: World, s: Scene) => w.archon?.numarade.motions.find((m) => m.id === s.data.motionId);
/** How each seat leans now: votes already given, or how it would vote. */
function leans(w: World, m: Motion): Record<string, Motion['votes'][string]> {
  const out: Record<string, Motion['votes'][string]> = {};
  for (const seat of w.archon!.numarade.seats) out[seat] = m.votes[seat] ?? aiVote(w, seat, m);
  return out;
}

function sessionView(w: World, s: Scene, m: Motion): void {
  const l = leans(w, m);
  const P = w.playerHouseId;
  if (m.kind === 'elect') {
    const cs = m.candidates ?? [];
    const count = cs.map((_, i) => Object.values(l).filter((v) => v === i).length);
    s.gauges = cs.slice(0, 4).map((c, i) => ({ label: c.name.split(' ')[0]!, value: count[i]!, max: w.archon!.numarade.seats.length }));
    const want = s.data.want as number | undefined;
    const lead = Math.max(...count);
    s.meter = want === undefined ? 0 : clamp(((count[want] ?? 0) - lead + 1) * 25, -100, 100);
  } else {
    const vs = Object.values(l);
    const aye = vs.filter((v) => v === 'aye').length, nay = vs.filter((v) => v === 'nay').length;
    s.gauges = [{ label: 'For', value: aye, max: 11 }, { label: 'Against', value: nay, max: 11, bad: true }, { label: 'Undecided', value: vs.length - aye - nay, max: 11 }];
    const need = m.needed === 'super' ? 8 : 6;
    const want = s.data.want as string | undefined;
    s.meter = want === 'aye' ? clamp((aye - need + 1) * 20, -100, 100) : want === 'nay' ? clamp((nay - (11 - need) + 1) * 20 + (aye < need ? 20 : -20), -100, 100) : 0;
  }
  s.theirs = w.archon!.numarade.seats.filter((x) => x !== P).map((seat) => {
    const v = l[seat];
    const firm = conviction(w, seat, m) >= 60;
    const lean = typeof v === 'number' ? (m.candidates?.[v]?.name ?? '?') : v === 'aye' ? 'for' : v === 'nay' ? 'against' : 'undecided';
    return { name: `House ${houseName(w, seat)}`, note: `${lean}${firm ? ', firm' : ', wavering'} · toward us ${regardOf(w, seat, P)}` };
  });
}

/** The seats most open to moving, nearest first. */
function waverers(w: World, m: Motion, toward: Motion['votes'][string]): string[] {
  const l = leans(w, m);
  return w.archon!.numarade.seats.filter((x) => x !== w.playerHouseId && l[x] !== toward && x !== m.target && x !== m.second && x !== m.by)
    .sort((a, b) => conviction(w, a, m) - conviction(w, b, m));
}

registerScene('session', {
  refresh(w, s) {
    const m = motionOf(w, s);
    if (!m || m.status !== 'open') { s.options = [{ key: 'leave', label: 'Leave the chamber' }]; s.prompt = 'The motion has been settled.'; return; }
    sessionView(w, s, m);
    const envoy = envoyOf(w);
    const want = s.data.want;
    const elect = m.kind === 'elect';
    if (s.step === 0) {
      s.prompt = elect ? 'Whom does our seat want in the chair?' : `What do we want from this: ${m.title}?`;
      s.options = elect
        ? (m.candidates ?? []).map((c, i) => ({ key: `want:${i}`, label: c.houseId === w.playerHouseId ? `Our own: ${c.name}` : `${c.name} (${houseName(w, c.houseId)})`, hint: `toward us ${c.houseId === w.playerHouseId ? '—' : regardOf(w, c.houseId, w.playerHouseId)}` }))
        : [{ key: 'want:aye', label: 'We want it carried' }, { key: 'want:nay', label: 'We want it to fall' }, { key: 'want:none', label: 'We have no stake: just vote' }];
      return;
    }
    if (s.step >= s.maxSteps - 1 || want === 'none') {
      s.prompt = 'The Exarchon calls the vote.';
      s.options = elect
        ? (m.candidates ?? []).map((c, i) => ({ key: `vote:${i}`, label: `Vote for ${c.name}` }))
        : [{ key: 'vote:aye', label: 'Vote aye' }, { key: 'vote:nay', label: 'Vote nay' }, { key: 'vote:abstain', label: 'Abstain' }];
      return;
    }
    const toward = elect ? (want as number) : (want as Motion['votes'][string]);
    const ws = waverers(w, m, toward);
    s.prompt = `Round ${s.step} of ${s.maxSteps - 2}. ${ws.length ? `${ws.length} seat${ws.length === 1 ? '' : 's'} could still move.` : 'Every seat is where we want it.'}`;
    const opts: Scene['options'] = [
      { key: 'speak', label: elect ? `Speak for ${m.candidates?.[toward as number]?.name ?? 'our choice'}` : want === 'aye' ? 'Speak for it' : 'Speak against it', hint: envoy ? `${shortName(envoy.name)}: eloquence + diplomacy` : undefined, odds: odds(envoy, ['eloquence', 'diplomacy'], 13), why: envoy ? undefined : 'We have no Speaker.' },
    ];
    for (const seat of ws.slice(0, 2)) {
      opts.push({ key: `word:${seat}`, label: `A quiet word with House ${houseName(w, seat)}`, hint: '1,500 othes if it works', odds: odds(envoy, ['negotiation', 'diplomacy'], 10 + conviction(w, seat, m) / 8), why: !envoy ? 'We have no Speaker.' : econ(w, w.playerHouseId).stock.othes < 1500 ? 'Needs 1,500 othes.' : undefined });
    }
    const friend = ws.find((seat) => regardOf(w, seat, w.playerHouseId) >= 45);
    if (friend) opts.push({ key: `call:${friend}`, label: `Call in House ${houseName(w, friend)}'s friendship`, hint: 'certain; it costs the friendship something' });
    opts.push({ key: 'wait', label: 'Let the others speak' });
    s.options = opts;
  },
  act(w, s, key, rng) {
    const m = motionOf(w, s);
    if (!m || m.status !== 'open' || key === 'leave') { end(w, s, true, m?.result ?? 'The motion was settled without us.', rng); return; }
    const P = w.playerHouseId;
    const envoy = envoyOf(w);
    if (key.startsWith('want:')) {
      const v = key.slice(5);
      s.data.want = m.kind === 'elect' ? Number(v) : v;
      if (v !== 'none') say(s, m.kind === 'elect' ? `Our seat will back ${m.candidates?.[Number(v)]?.name}.` : `Our seat wants it ${v === 'aye' ? 'carried' : 'to fall'}.`);
      return;
    }
    const toward = m.kind === 'elect' ? (s.data.want as number) : (s.data.want as Motion['votes'][string]);
    if (key === 'speak') {
      const r = test(rng, envoy, ['eloquence', 'diplomacy'], 13);
      if (r.ok) {
        const moved = waverers(w, m, toward).filter((x) => conviction(w, x, m) < 60).slice(0, r.margin > 4 ? 2 : 1);
        for (const x of moved) m.votes[x] = toward;
        say(s, `${nameOf(w, envoy?.id)} speaks, and the room listens.${moved.length ? ` ${moved.map((x) => `House ${houseName(w, x)}`).join(' and ')} come${moved.length === 1 ? 's' : ''} round.` : ''}`, 'good');
      } else say(s, `${nameOf(w, envoy?.id)} speaks well enough. Nobody moves.`, 'bad');
    } else if (key.startsWith('word:')) {
      const seat = key.slice(5);
      const r = test(rng, envoy, ['negotiation', 'diplomacy'], 10 + conviction(w, seat, m) / 8);
      if (r.ok) { m.votes[seat] = toward; econ(w, P).stock.othes -= 1500; shiftRegard(w, seat, P, 3); say(s, `A word in a corridor, a promise of 1,500 othes: House ${houseName(w, seat)} is with us.`, 'good'); }
      else { shiftRegard(w, seat, P, -3); say(s, `House ${houseName(w, seat)} hears us out and is offended by the offer.`, 'bad'); }
    } else if (key.startsWith('call:')) {
      const seat = key.slice(5);
      m.votes[seat] = toward;
      shiftRegard(w, seat, P, -12);
      say(s, `House ${houseName(w, seat)} does what friends do, and lets us know what it cost them.`, 'good');
    } else if (key === 'wait') {
      say(s, 'The others speak. Nothing much changes.');
    } else if (key.startsWith('vote:')) {
      const v = key.slice(5);
      m.votes[P] = m.kind === 'elect' ? Number(v) : (v as Motion['votes'][string]);
      closeMotion(w, rng, m);
      const passed = (m as Motion).status === 'passed';
      const want = s.data.want;
      const good = m.kind === 'elect'
        ? w.archon!.numarade.exarchon?.name === m.candidates?.[want as number]?.name
        : want === 'none' ? true : (want === 'aye') === passed;
      end(w, s, good, `${m.title}: ${m.result ?? (passed ? 'carried' : 'fell')}`, rng);
      return;
    }
    sessionView(w, s, m);
  },
  auto(w, s) {
    const m = motionOf(w, s);
    if (!m || m.status !== 'open') return 'leave';
    if (s.step === 0) { const v = aiVote(w, w.playerHouseId, m); return `want:${typeof v === 'number' ? v : v === 'abstain' ? 'none' : v}`; }
    if (s.options.some((o) => o.key.startsWith('vote:'))) return `vote:${m.kind === 'elect' ? s.data.want : s.data.want === 'none' ? aiVote(w, w.playerHouseId, m) : s.data.want}`;
    const sp = s.options.find((o) => o.key === 'speak');
    return sp && !sp.why && (sp.odds ?? 0) > 0.4 ? 'speak' : 'wait';
  },
  finish(w, s) {
    const m = motionOf(w, s);
    if (m && m.status === 'open' && m.votes[w.playerHouseId] === undefined) m.votes[w.playerHouseId] = aiVote(w, w.playerHouseId, m);
  },
});

onSession((w, m) => {
  const elect = m.kind === 'elect';
  startScene(w, {
    kind: 'session', title: m.title, eyebrow: 'The Numarade in session', where: 'the chamber of the Numarade', maxSteps: 5,
    meterLabels: ['against us', 'our way'], ours: [envoyOf(w)?.id].filter(Boolean) as string[], theirs: [], data: { motionId: m.id },
    leaveTo: envoyOf(w)?.id, intro: elect ? 'The chair is empty. The seats file in to choose an Exarchon, who will serve for life.' : `The seats file in. The Exarchon reads the motion: ${m.title}.`,
  });
  return true;
});

// ================================================================ negotiation

export type TalkKind = 'peace' | 'pact';
interface Talk { kind: TalkKind; other: string; warId?: string; limit: number; ask: number; offer: number; patience: number; read?: [number, number] }
const talkOf = (s: Scene) => s.data as unknown as Talk;

function peaceLimit(w: World, war: War, rng: Rng): number {
  const P = w.playerHouseId;
  const ours = sideOf(war, P)!;
  const score = ours === 'attackers' ? war.score : -war.score;
  const foe = ours === 'attackers' ? war.defender : war.attacker;
  return clamp(50 + score / 2 + (war.exhaustion[foe] ?? 0) / 4 - (war.exhaustion[P] ?? 0) / 4 + rng.gauss() * 8, 5, 95);
}

/** What a level of a peace deal means for us. */
export function peaceMeaning(v: number, war?: War): string {
  if (v >= 92) return `they yield: ${war ? GOAL_LABEL[war.goal].toLowerCase() : 'our terms'}`;
  if (v >= 80) return 'they pay tribute for five years';
  if (v >= 65) return 'they pay reparations';
  if (v >= 40) return 'an even peace';
  if (v >= 22) return 'we pay reparations';
  return 'we yield to their terms';
}
const pactMeaning = (v: number) => (v >= 70 ? 'a sworn pact' : v >= 40 ? 'friendship, and nothing binding' : 'polite words');

export function startTalks(w: World, kind: TalkKind, other: string, warId?: string): Scene {
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const war = warId ? w.war?.wars.find((x) => x.id === warId) : undefined;
  const limit = kind === 'peace' && war ? peaceLimit(w, war, rng) : clamp(40 + regardOf(w, other, P) / 2 + affinity(w, other, P) * 30 - 15 + rng.gauss() * 8, 0, 100);
  const t: Talk = { kind, other, warId, limit, ask: clamp(limit + 20 + rng.int(0, 10), 30, 100), offer: clamp(limit - 25 - rng.int(0, 10), 0, 90), patience: 3 + Math.round(Math.max(0, regardOf(w, other, P)) / 40) };
  w.rng = rng.state;
  return startScene(w, {
    kind: 'negotiation', title: kind === 'peace' ? `Peace talks with House ${houseName(w, other)}` : `A pact with House ${houseName(w, other)}`, eyebrow: 'Negotiation',
    where: kind === 'peace' ? 'a neutral station' : `the court of House ${houseName(w, other)}`, maxSteps: 8, meterLabels: ['their way', 'our way'],
    ours: [envoyOf(w)?.id].filter(Boolean) as string[], theirs: [{ name: `the envoys of House ${houseName(w, other)}` }], data: t as unknown as Record<string, unknown>, leaveTo: envoyOf(w)?.id,
    intro: kind === 'peace' ? `Envoys of House ${houseName(w, other)} sit across the table. They open low.` : `House ${houseName(w, other)} has agreed to hear us.`,
  });
}

function talkView(s: Scene): void {
  const t = talkOf(s);
  const mean = t.kind === 'peace' ? peaceMeaning : pactMeaning;
  s.meter = t.offer * 2 - 100;
  s.gauges = [{ label: 'Their patience', value: Math.max(0, t.patience), max: 6, bad: t.patience <= 1 }, { label: 'Our ask', value: Math.round(t.ask), max: 100 }, { label: 'Their offer', value: Math.round(t.offer), max: 100 }];
  s.theirs = [{ name: s.theirs[0]?.name ?? 'their envoys', note: `offer: ${mean(t.offer)}${t.read ? ` · they will go to ${Math.round(t.read[0])}–${Math.round(t.read[1])}, we think` : ''}` }];
}

registerScene('negotiation', {
  refresh(w, s) {
    const t = talkOf(s);
    talkView(s);
    const envoy = envoyOf(w);
    const mean = t.kind === 'peace' ? peaceMeaning : pactMeaning;
    s.prompt = `We ask for ${mean(t.ask)} (${Math.round(t.ask)}). They offer ${mean(t.offer)} (${Math.round(t.offer)}).`;
    s.options = [
      { key: 'take', label: `Take their offer: ${mean(t.offer)}` },
      { key: 'hold', label: 'Hold to our terms', hint: 'they may come up; patience runs down' },
      { key: 'press', label: 'Ask for more', hint: 'patience runs down faster' },
      { key: 'give', label: 'Give some ground' },
      { key: 'read', label: 'Read them', hint: envoy ? `${shortName(envoy.name)}: insight + perception` : undefined, odds: odds(envoy, ['insight', 'perception'], 12), why: envoy ? undefined : 'We have no Speaker.' },
      ...(t.kind === 'peace' ? [{ key: 'threat', label: 'Remind them what more war will cost', hint: 'intrigue + eloquence', odds: odds(envoy, ['intrigue', 'eloquence'], 14), why: envoy ? undefined : 'We have no Speaker.' }] : []),
      { key: 'walk', label: 'Walk away' },
    ];
  },
  act(w, s, key, rng) {
    const t = talkOf(s);
    const envoy = envoyOf(w);
    if (key === 'take') { settleTalk(w, s, t.offer, rng); return; }
    if (key === 'walk') { end(w, s, false, 'We walk away from the table.', rng); return; }
    if (key === 'press') { t.ask = clamp(t.ask + 12, 0, 100); t.patience -= t.ask > t.limit + 5 ? 1.5 : 0.5; say(s, `We ask for more: ${Math.round(t.ask)}.`); }
    if (key === 'give') { t.ask = clamp(t.ask - 12, 0, 100); t.patience += 0.5; say(s, `We give some ground: ${Math.round(t.ask)}.`); }
    if (key === 'read') {
      const r = test(rng, envoy, ['insight', 'perception'], 12);
      const spread = r.ok ? 5 : 18;
      t.read = [clamp(t.limit - spread + rng.gauss() * 2, 0, 100), clamp(t.limit + spread + rng.gauss() * 2, 0, 100)];
      say(s, r.ok ? `${nameOf(w, envoy?.id)} watches their hands and their pauses: they will go to about ${Math.round(t.limit)}.` : `${nameOf(w, envoy?.id)} cannot read them well.`, r.ok ? 'good' : undefined);
      t.patience -= 0.3;
    }
    if (key === 'threat') {
      const r = test(rng, envoy, ['intrigue', 'eloquence'], 14);
      if (r.ok) { t.limit = clamp(t.limit + 8, 0, 100); say(s, 'They go pale at what we describe. Their room to move widens.', 'good'); }
      else { t.patience -= 1.5; t.limit = clamp(t.limit - 4, 0, 100); say(s, 'The threat lands badly. They stiffen.', 'bad'); }
    }
    if (key === 'hold') { t.patience -= t.ask > t.limit ? 1 : 0.5; say(s, 'We hold.'); }
    // Their move: up toward what they will really give.
    if (key !== 'read') t.offer = clamp(t.offer + Math.max(0, (t.limit - t.offer) * (key === 'hold' ? 0.45 : 0.3)), 0, t.limit);
    if (t.ask <= t.offer + 1) { settleTalk(w, s, t.ask, rng); return; }
    if (t.patience <= 0) { end(w, s, false, `House ${houseName(w, t.other)}'s envoys rise and leave the table.`, rng); return; }
    if (s.step >= s.maxSteps) { settleTalk(w, s, t.offer, rng); return; }
    talkView(s);
  },
  auto(_w, s) {
    const t = talkOf(s);
    if (t.ask <= t.offer + 6 || t.patience <= 1.5) return 'take';
    if (!t.read) return 'read';
    if (t.ask > t.limit + 6) return 'give';
    return 'hold';
  },
  finish(w, s) {
    const t = talkOf(s);
    if (!s.result?.good && s.result?.text.includes('leave')) shiftRegard(w, t.other, w.playerHouseId, -5);
  },
});

function settleTalk(w: World, s: Scene, v: number, rng: Rng): void {
  const t = talkOf(s);
  const P = w.playerHouseId;
  if (t.kind === 'pact') {
    if (v >= 70) {
      if (w.houses[t.other] && w.houses[P]) w.realm?.alliances.push({ id: `al${w.nextId++}`, a: P, b: t.other, since: w.date });
      else w.archon?.pacts.push({ a: P, b: t.other, since: w.date.year, cause: 'sworn at the table' });
      shiftRegard(w, t.other, P, 10);
      w.archon?.history.push({ year: w.date.year, kind: 'pact', text: `House ${houseName(w, P)} and House ${houseName(w, t.other)} swore a pact.`, houses: [P, t.other] });
      end(w, s, true, `A pact is sworn with House ${houseName(w, t.other)}.`, rng);
    } else if (v >= 40) { shiftRegard(w, t.other, P, 15); end(w, s, true, `No pact, but House ${houseName(w, t.other)} leaves a friend.`, rng); }
    else end(w, s, false, 'Polite words, and nothing else.', rng);
    return;
  }
  const war = w.war?.wars.find((x) => x.id === t.warId && x.status === 'active');
  if (!war) { end(w, s, false, 'The war ended before the talks did.', rng); return; }
  const ours = sideOf(war, P)!;
  const us = ours, them = ours === 'attackers' ? 'defenders' : 'attackers';
  const what = peaceMeaning(v, war);
  if (v >= 92) endWar(w, rng, war, us, 'Agreed at the table.', war.rung === 'war' ? war.goal : 'tribute');
  else if (v >= 80) endWar(w, rng, war, us, 'Agreed at the table.', 'tribute');
  else if (v >= 65) endWar(w, rng, war, us, 'Agreed at the table.', 'reparations');
  else if (v >= 40) endWar(w, rng, war, 'none', 'An even peace is agreed at the table.');
  else if (v >= 22) endWar(w, rng, war, them, 'Agreed at the table.', 'reparations');
  else endWar(w, rng, war, them, 'We yield at the table.', war.attacker === P ? 'humble' : war.goal);
  end(w, s, v >= 40, `Agreed: ${what}.`, rng);
}

// ================================================================ audiences and interrogations

interface Talking { mode: 'captive' | 'private'; truth: number; temper: number; told: string[] }
const audOf = (s: Scene) => s.data as unknown as Talking;
const resist = (c: Character) => (c.stats.composure + c.stats.willpower) / 2;

export function startAudience(w: World, personId: string, mode: 'captive' | 'private'): Scene {
  const c = w.characters[personId]!;
  const asker = mode === 'captive' ? spyOf(w) ?? lordOf(w) : lordOf(w);
  return startScene(w, {
    kind: 'audience', title: mode === 'captive' ? `Questioning ${displayName(c.name)}` : `A private word with ${displayName(c.name)}`, eyebrow: mode === 'captive' ? 'Interrogation' : 'Audience',
    where: mode === 'captive' ? 'the cells' : 'the Highroy\'s study', maxSteps: 6, meter: -100, meterLabels: ['guarded', 'open'], gauges: [{ label: 'Temper', value: 0, max: 100, bad: true }],
    ours: [asker?.id].filter(Boolean) as string[], theirs: [{ id: c.id, name: displayName(c.name), note: `${c.role}` }],
    data: { mode, truth: 0, temper: 0, told: [] } as unknown as Record<string, unknown>, leaveTo: asker?.id,
    intro: mode === 'captive' ? `${displayName(c.name)} is brought up from the cells and sat down.` : `${displayName(c.name)} is shown in. They do not know why.`,
  });
}

function reveal(w: World, s: Scene, c: Character, rng: Rng): void {
  const a = audOf(s);
  const P = w.playerHouseId;
  const next = (at: number, key: string, fn: () => string | null) => {
    if (a.truth >= at && !a.told.includes(key)) { a.told.push(key); const t = fn(); if (t) say(s, t, 'good'); }
  };
  if (a.mode === 'private') {
    next(30, 'want', () => { const amb = w.ambitions?.of[c.id]; return amb ? `They admit what they want: ${AMBITION_LABEL[amb.kind].toLowerCase()}.` : 'They want nothing they will name.'; });
    next(55, 'thread', () => { const t = openThreads(w, c.id).find((x) => x.kind === 'secret' || x.kind === 'grudge' || x.kind === 'debt'); return t ? `Then something they have carried a while: ${t.text.toLowerCase()}.` : 'They have no secrets worth the name.'; });
    next(80, 'heart', () => { const tr = c.traits.find((x) => TRAITS_BY_ID[x.id]); learn(w, P, c.id, 25); return `By the end you know them better than most do${tr ? `: ${TRAITS_BY_ID[tr.id]!.label.replace(' {detail}', '').toLowerCase()} to the bone` : ''}.`; });
  } else {
    next(30, 'self', () => { learn(w, P, c.id, 30); return 'They talk about themselves, more than they meant to.'; });
    next(60, 'house', () => { const lines = interrogateInPlace(w, c.id, rng); return lines.length ? lines.join(' ') : `They give up what they know of House ${houseName(w, c.houseId)}.`; });
    next(85, 'secret', () => { for (const x of Object.values(w.characters)) if (x.alive && x.houseId === c.houseId && x.seat) learn(w, P, x.id, 10); return `And names: who sits on House ${houseName(w, c.houseId)}'s council, and what they are like.`; });
  }
}

registerScene('audience', {
  refresh(w, s) {
    const a = audOf(s);
    const c = w.characters[s.theirs[0]!.id!]!;
    const asker = w.characters[s.ours[0] ?? ''];
    const r = resist(c);
    s.meter = a.truth * 2 - 100;
    s.gauges = [{ label: 'Temper', value: Math.round(a.temper), max: 100, bad: true }];
    s.prompt = a.temper >= 70 ? 'They are close to saying nothing more at all.' : a.truth >= 60 ? 'They are talking now.' : 'They are careful.';
    s.options = [
      { key: 'ask', label: 'Ask plainly', odds: odds(asker, ['insight', 'diplomacy'], r) },
      { key: 'press', label: 'Press them on it', hint: 'more, and angrier', odds: odds(asker, ['intrigue', 'insight'], r + 2) },
      ...(a.mode === 'captive' ? [{ key: 'threaten', label: 'Threaten them', hint: 'fast; they will hate us', odds: odds(asker, ['intrigue', 'willpower'], r - 1) }] : []),
      { key: 'flatter', label: 'Put them at ease', odds: odds(asker, ['eloquence', 'diplomacy'], r - 2) },
      { key: 'offer', label: 'Offer them something', hint: '500 othes', why: econ(w, w.playerHouseId).stock.othes < 500 ? 'Needs 500 othes.' : undefined },
      { key: 'done', label: 'That will do' },
    ];
  },
  act(w, s, key, rng) {
    const a = audOf(s);
    const c = w.characters[s.theirs[0]!.id!]!;
    const asker = w.characters[s.ours[0] ?? ''];
    const r = resist(c);
    if (key === 'done') { end(w, s, a.truth >= 50, a.truth >= 50 ? 'You have what you came for.' : 'You let them go, knowing little more.', rng); return; }
    const step = (stats: Parameters<typeof test>[2], dc: number, gain: number, heat: number, line: [string, string]) => {
      const t = test(rng, asker, stats, dc);
      a.truth = clamp(a.truth + (t.ok ? gain : gain / 4), 0, 100);
      a.temper = clamp(a.temper + heat + (t.ok ? 0 : 8), 0, 100);
      say(s, t.ok ? line[0] : line[1], t.ok ? undefined : 'bad');
    };
    if (key === 'ask') step(['insight', 'diplomacy'], r, 15, 2, ['They answer, carefully.', 'They answer a different question.']);
    if (key === 'press') step(['intrigue', 'insight'], r + 2, 25, 15, ['You find the soft place and press on it.', 'They see it coming.']);
    if (key === 'threaten') step(['intrigue', 'willpower'], r - 1, 32, 30, ['Fear does the work.', 'They laugh at it.']);
    if (key === 'flatter') { step(['eloquence', 'diplomacy'], r - 2, 10, -20, ['They ease a little.', 'They see the flattery for what it is.']); }
    if (key === 'offer') { econ(w, w.playerHouseId).stock.othes -= 500; a.truth = clamp(a.truth + 20, 0, 100); a.temper = clamp(a.temper - 5, 0, 100); say(s, 'Coin changes hands. Tongues loosen.'); }
    reveal(w, s, c, rng);
    if (a.temper >= 100) { end(w, s, false, `${shortName(c.name)} goes silent and will say nothing more.`, rng); return; }
    if (a.truth >= 100 || s.step >= s.maxSteps) end(w, s, a.truth >= 50, a.truth >= 100 ? 'There is nothing left they have not told you.' : 'Time is up.', rng);
  },
  auto(_w, s) {
    const a = audOf(s);
    if (a.truth >= 85 || a.temper >= 75) return 'done';
    if (a.temper >= 45) return 'flatter';
    return a.mode === 'captive' && a.truth < 40 ? 'press' : 'ask';
  },
  finish(w, s) {
    const a = audOf(s);
    const c = w.characters[s.theirs[0]!.id!];
    if (!c) return;
    if (a.mode === 'private') {
      if (a.temper >= 70) { shiftMood(c, -10); const lord = lordOf(w); if (lord) shiftOpinion(w, c.id, lord.id, -8, 'a hard private audience'); }
      else { shiftMood(c, 4); const lord = lordOf(w); if (lord) shiftOpinion(w, c.id, lord.id, 4, 'the Highroy took time to hear them'); }
    } else {
      const cap = w.captives[c.id];
      if (cap) cap.interrogated = true;
      if (a.temper >= 70) shiftRegard(w, c.houseId, w.playerHouseId, -4);
    }
  },
});

// ================================================================ ceremonies

type Rite = 'funeral' | 'knighting' | 'crowning';
interface RiteData { rite: Rite; person: string; killer?: string; words: string[] }
const riteOf = (s: Scene) => s.data as unknown as RiteData;

const RITE_STEPS: Record<Rite, { prompt: string; options: { key: string; label: string; hint: string }[] }[]> = {
  funeral: [
    { prompt: 'What is said over them?', options: [
      { key: 'deeds', label: 'Their deeds', hint: 'renown; their family is proud' },
      { key: 'house', label: 'What they gave the house', hint: 'the court steadies; the family wanted more' },
      { key: 'enemy', label: 'Who did this to them', hint: 'a grudge for their kin; dread' },
      { key: 'faith', label: 'The Celarchs, who keep all things', hint: 'comfort for everyone' },
    ] },
    { prompt: 'Who speaks?', options: [
      { key: 'lord', label: 'The Highroy', hint: 'it honours them' },
      { key: 'friend', label: 'Their oldest friend', hint: 'it is true' },
      { key: 'none', label: 'No one; a silence', hint: 'the old way' },
    ] },
  ],
  knighting: [
    { prompt: 'Which oath do they swear?', options: [
      { key: 'house', label: 'To the house', hint: 'loyal to whoever rules' },
      { key: 'lord', label: 'To the Highroy', hint: 'personal, and binding' },
      { key: 'faith', label: 'Before the Celarchs', hint: 'will and steadiness' },
    ] },
    { prompt: 'Who gives the accolade?', options: [
      { key: 'lord', label: 'The Highroy', hint: 'a great honour' },
      { key: 'gm', label: 'The Grand Master', hint: 'the knights approve' },
      { key: 'champion', label: 'The Champion', hint: 'they will want to live up to it' },
    ] },
  ],
  crowning: [
    { prompt: 'The new Highroy\'s first words.', options: [
      { key: 'continuity', label: 'Nothing changes', hint: 'the court settles' },
      { key: 'change', label: 'A new age', hint: 'the ambitious are pleased; the old guard is not' },
      { key: 'vengeance', label: 'Vengeance for the one before', hint: 'only if they were killed' },
    ] },
    { prompt: 'Gifts to the families?', options: [
      { key: 'gifts', label: 'Generous gifts', hint: '3,000 othes; loyalty' },
      { key: 'token', label: 'Tokens only', hint: 'a little loyalty' },
      { key: 'none', label: 'None', hint: 'they will notice' },
    ] },
  ],
};

export function startCeremony(w: World, rite: Rite, personId: string, killer?: string): Scene {
  const c = w.characters[personId]!;
  const title = rite === 'funeral' ? `The funeral of ${displayName(c.name)}` : rite === 'knighting' ? `${displayName(c.name)} is knighted` : `${displayName(c.name)} takes the seat`;
  return startScene(w, {
    kind: 'ceremony', title, eyebrow: rite === 'funeral' ? 'Funeral' : rite === 'knighting' ? 'Knighting' : 'Crowning', where: 'the great hall', maxSteps: 2,
    meterLabels: ['sour', 'well done'], ours: [lordOf(w)?.id].filter(Boolean) as string[], theirs: [{ id: c.id, name: displayName(c.name), note: c.role }],
    data: { rite, person: personId, killer, words: [] } as unknown as Record<string, unknown>, leaveTo: lordOf(w)?.id,
    intro: rite === 'funeral' ? `The house gathers for ${displayName(c.name)}.` : rite === 'knighting' ? `${displayName(c.name)} kneels in the hall.` : `The court gathers to see ${displayName(c.name)} take the seat.`,
  });
}

registerScene('ceremony', {
  refresh(w, s) {
    const r = riteOf(s);
    const st = RITE_STEPS[r.rite][s.step];
    if (!st) return;
    s.prompt = st.prompt;
    s.options = st.options.map((o) => ({ ...o, why: o.key === 'vengeance' && !r.killer ? 'They were not killed.' : o.key === 'enemy' && !r.killer ? 'No one did this.' : o.key === 'gifts' && econ(w, w.playerHouseId).stock.othes < 3000 ? 'Needs 3,000 othes.' : undefined }));
  },
  act(w, s, key, rng) {
    const r = riteOf(s);
    r.words.push(key);
    const label = RITE_STEPS[r.rite][s.step - 1]?.options.find((o) => o.key === key)?.label ?? key;
    say(s, label + '.');
    s.meter = clamp(s.meter + (key === 'none' && r.rite === 'crowning' ? -30 : 25), -100, 100);
    if (s.step >= s.maxSteps) end(w, s, s.meter >= 0, r.rite === 'funeral' ? 'They are laid to rest.' : r.rite === 'knighting' ? 'They rise a knight.' : 'The house has its Highroy.', rng);
  },
  auto(_w, s) { const r = riteOf(s); return RITE_STEPS[r.rite][s.step]?.options.find((o) => !s.options.find((x) => x.key === o.key)?.why)?.key ?? 'none'; },
  finish(w, s) {
    const r = riteOf(s);
    const P = w.playerHouseId;
    const c = w.characters[r.person];
    if (!c) return;
    const kin = Object.values(w.characters).filter((x) => x.alive && x.familyId === c.familyId && x.id !== c.id);
    const court = Object.values(w.characters).filter((x) => x.alive && x.houseId === P && x.seat);
    const std = w.houses[P]!.standing;
    for (const k of r.words) {
      if (r.rite === 'funeral') {
        if (k === 'deeds') { for (const x of kin) shiftMood(x, 6); std.respect = clamp(std.respect + 1, 0, 100); }
        if (k === 'house') { for (const x of court) shiftMood(x, 3); for (const x of kin) shiftMood(x, -3); }
        if (k === 'enemy' && r.killer) { for (const x of kin.slice(0, 3)) addThread(w, x.id, 'grudge', `Swore at ${shortName(c.name)}'s funeral to answer House ${houseName(w, r.killer)}`, r.killer); std.dread = clamp(std.dread + 2, 0, 100); shiftRegard(w, r.killer, P, -5); }
        if (k === 'faith') for (const x of [...kin, ...court]) shiftMood(x, 3);
        if (k === 'lord') for (const x of kin) shiftMood(x, 4);
        if (k === 'friend') for (const x of kin) shiftMood(x, 2);
      } else if (r.rite === 'knighting') {
        if (k === 'house') addThread(w, c.id, 'vow', 'Swore to the house at their knighting');
        if (k === 'lord') { const lord = lordOf(w); addThread(w, c.id, 'vow', 'Swore to the Highroy in person at their knighting', lord?.id); if (lord) shiftOpinion(w, c.id, lord.id, 10, 'swore to them in person'); }
        if (k === 'faith') c.stats.willpower = clamp(c.stats.willpower + 1, 1, 20);
        if (k === 'lord' || k === 'gm' || k === 'champion') shiftMood(c, 8);
        if (k === 'gm') { const gm = seatHolder(w, P, 'grandMaster'); if (gm) { shiftMood(gm, 3); shiftOpinion(w, c.id, gm.id, 6, 'gave them the accolade'); } }
        if (k === 'champion') { const ch = seatHolder(w, P, 'champion'); if (ch) shiftOpinion(w, c.id, ch.id, 8, 'gave them the accolade'); c.stats.valor = clamp(c.stats.valor + 1, 1, 20); }
      } else {
        if (k === 'continuity') for (const x of court) shiftMood(x, 4);
        if (k === 'change') for (const x of court) shiftMood(x, x.traits.some((t) => t.id === 'ambitious') ? 6 : -3);
        if (k === 'vengeance' && r.killer) { std.dread = clamp(std.dread + 3, 0, 100); shiftRegard(w, r.killer, P, -10); addThread(w, c.id, 'vow', `Swore vengeance on House ${houseName(w, r.killer)} at the crowning`, r.killer); }
        if (k === 'gifts') { econ(w, P).stock.othes -= 3000; for (const x of court) shiftMood(x, 6); }
        if (k === 'token') for (const x of court) shiftMood(x, 2);
        if (k === 'none') for (const x of court) shiftMood(x, -5);
      }
    }
  },
});

/** Deaths of our own, a new Highroy: ceremonies come to the hall. */
export function ceremoniesDue(w: World): void {
  const P = w.playerHouseId;
  if ((w.scenes?.list ?? []).some((x) => x.status !== 'over' && x.kind === 'ceremony')) return;
  const lord = lordOf(w);
  if (lord && once(w, `ruler:${lord.id}`)) {
    if ((w.scenes?.seen ?? []).some((k) => k.startsWith('ruler:') && k !== `ruler:${lord.id}`)) {
      const before = Object.values(w.characters).filter((c) => !c.alive && c.houseId === P && c.seat === 'highroy').sort((a, b) => (b.death?.date.year ?? 0) - (a.death?.date.year ?? 0))[0];
      startCeremony(w, 'crowning', lord.id, before?.death?.cause.match(/House (\w+)/)?.[1]?.toLowerCase());
      return;
    }
  }
  const dead = Object.values(w.characters).find((c) => !c.alive && c.houseId === P && c.tier === 'full' && (c.seat || c.flags.some((f) => f.id === 'knighted') || c.familyId === lord?.familyId) && c.death && w.date.year * 800 + w.date.cycle - (c.death.date.year * 800 + c.death.date.cycle) <= 16 && !(w.scenes?.seen ?? []).includes(`funeral:${c.id}`));
  if (dead && once(w, `funeral:${dead.id}`)) {
    const killer = liveHouses(w).find((h) => dead.death!.cause.includes(`House ${h.name}`))?.id;
    startCeremony(w, 'funeral', dead.id, killer);
  }
}

// ================================================================ the chronicle of the year

export function startChronicle(w: World, year: number): Scene {
  const P = w.playerHouseId;
  const recs = w.feed.filter((f) => f.date.year === year);
  const ours = (id?: string) => !!id && w.characters[id]?.houseId === P;
  const deaths = recs.filter((f) => f.kind === 'death' && f.characterIds?.some(ours));
  const births = recs.filter((f) => f.kind === 'birth' && f.characterIds?.some(ours));
  const battles = (w.battles?.list ?? []).filter((b) => b.created.year === year && b.result);
  const won = battles.filter((b) => b.result!.winner === 0).length;
  const wars = (w.war?.wars ?? []).filter((x) => sideOf(x, P) && (x.since.year === year || x.result?.date.year === year));
  const motions = (w.archon?.numarade.motions ?? []).filter((m) => m.date.year === year && m.status !== 'open');
  const big = recs.filter((f) => (f.severity ?? 0) >= 3).slice(-6);
  const lines = [
    `${deaths.length ? `${deaths.length} of ours died` : 'None of ours died'}; ${births.length ? `${births.length} born` : 'none born'}.`,
    battles.length ? `${battles.length} battles fought, ${won} won.` : 'No battles.',
    wars.length ? `War: ${wars.map((x) => `${x.name}${x.result && x.result.date.year === year ? ` (${x.result.text})` : ''}`).join('; ')}.` : 'No wars of ours.',
    motions.length ? `The Numarade: ${motions.slice(0, 3).map((m) => `${m.title} — ${m.status === 'passed' ? 'carried' : 'fell'}`).join('; ')}.` : 'The Numarade did nothing that touched us.',
    `Standing in the Archon: ${Math.round(prestigeOf(w, P))}.`,
  ];
  const crises = (w.scenes?.list ?? []).filter((x) => x.kind === 'crisis' && x.created.year === year).length;
  const themes: [string, number][] = [
    ['Mourning', deaths.length * 2], ['Steel', won * 1.5], ['the Banners', wars.length * 3], ['the Chamber', motions.length], ['Cradles', births.length * 1.5],
    ['Fevers', crises * 3], ['the Long Watch', battles.length ? 0 : 1.2], ['Quiet', 1],
  ];
  const ranked = themes.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const flavour = ['Ash', 'Glass', 'Long Nights', 'the Bright Hand', 'Iron', 'Salt', 'Small Mercies', 'the Grey Tide', 'Lanterns', 'Thorns'];
  const lordName = shortName(lordOf(w)?.name ?? { given: 'the Highroy' } as never);
  const names = [`the Year of ${ranked[0] ?? 'Quiet'}`, ranked[1] ? `the Year of ${ranked[1]}` : `the Year of ${flavour[(year * 7 + deaths.length) % flavour.length]}`, `the Year ${lordName} ${won > battles.length / 2 && battles.length ? 'Held' : deaths.length > 2 ? 'Grieved' : 'Waited'}`];
  return startScene(w, {
    kind: 'chronicle', title: `The chronicle of SY-${year}`, eyebrow: 'The year ends', maxSteps: 1, meter: clamp((won - (battles.length - won)) * 20 + (deaths.length ? -10 : 10), -100, 100),
    meterLabels: ['a hard year', 'a good year'], ours: [lordOf(w)?.id].filter(Boolean) as string[], theirs: big.map((f) => ({ name: f.text.length > 90 ? `${f.text.slice(0, 88)}…` : f.text })),
    data: { year, names }, leaveTo: lordOf(w)?.id, intro: lines.join(' '),
  });
}

registerScene('chronicle', {
  refresh(_w, s) {
    const names = s.data.names as string[];
    s.prompt = 'The archivists ask what the year should be called.';
    s.options = names.map((n, i) => ({ key: `name:${i}`, label: n.charAt(0).toUpperCase() + n.slice(1) }));
  },
  act(w, s, key, rng) {
    const names = s.data.names as string[];
    const n = names[Number(key.slice(5))] ?? names[0]!;
    s.data.named = n;
    end(w, s, s.meter >= 0, `SY-${s.data.year} is written into the annals as ${n}.`, rng);
  },
  auto() { return 'name:0'; },
  finish(w, s) {
    const P = w.playerHouseId;
    const year = s.data.year as number;
    const n = (s.data.named as string) ?? (s.data.names as string[])[0];
    (w.annals[P] ??= []).push({ date: { year, cycle: 799 }, text: `SY-${year} was called ${n}.`, public: true });
    logRecord(w, { kind: 'world', type: 'world', severity: 1, text: `The chronicle: SY-${year} is ${n}.` });
  },
});

export { fmt as _fmt, pct as _pct };
export type { WarGoal };
