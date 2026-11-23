// Every decision the Highroy can make about one person, in one list. The right-click menu on a name and
// the Decisions panel on a character's sheet both read from here, so the two never disagree.
import type { Route } from './router';
import type { Character, CouncilSeat, World } from '../sim/types';
import { ageOf } from '../sim/characters';
import { SPECIES } from '../data/species';
import { cannotHoldAudience, cannotKnight, holdAudience, knight, appointToSeat } from '../sim/ambitions';
import { bondCaige, caigeAdvice, caigesOf, cannotGrant } from '../sim/discovery';
import { cannotCounsel, isAgent, isHouseholdNoble, occupationOf, OCCUPATION_LABEL, OCCUPATION_NOTE, recruitAgent, releaseAgent, seekWisdom, setOccupation, agentsOf, maxAgents } from '../sim/household';
import { appointAmbassador, cannotAppoint, embassy } from '../sim/embassies';
import { isVeteran, hasPost, letRest, postsFor } from '../sim/veterans';
import { attend, cannotAttend, ATTEND_COST, TREAT_COST } from '../sim/infirmary';
import { cannotLead, activeMissionOf, activeMissions, MISSION_LABEL } from '../sim/missions';
import { mayLeadEnvoy, ENVOY_ROLE } from '../sim/politics';
import { isMilitary, fightScore } from '../sim/grounds';
import { togglePin } from '../sim/careers';
import { toggleWatch } from '../sim/ports';
import { cannotPoach, poach, poachable, poachOdds, POACH_APPROACH } from '../sim/houses';
import { enrolmentOf } from '../sim/training';
import { stageOf } from '../sim/ladder';
import { isAway } from '../sim/court';
import { seatHolder } from '../sim/query';
import { SEAT_TITLE } from '../sim/world';
import { shortName } from '../sim/names';
import { openStruggles } from '../sim/storystate';
import { cannotJoin, joinStruggle, leaveStruggle } from '../sim/story';

export type Group = 'Court' | 'Arms' | 'Missions' | 'Learning' | 'Intrigue' | 'Sheet';
export const GROUPS: Group[] = ['Court', 'Arms', 'Missions', 'Learning', 'Intrigue', 'Sheet'];

export interface Decision {
  key: string;
  group: Group;
  label: string;
  /** Why it can't be done now; shown greyed with the reason. */
  why?: string | null;
  /** A short note: a cost, odds, or whose advice it is. */
  note?: string;
  primary?: boolean;
  /** Changes the world. */
  run?: (w: World) => World;
  /** Or takes you somewhere to finish it. */
  to?: Route;
  /** Or opens a short list of choices. */
  sub?: Decision[];
  /** Only on the sheet, not in the quick menu. */
  pageOnly?: boolean;
  /** Only in the quick menu (the sheet is already open). */
  menuOnly?: boolean;
  /** A fact, not a choice: shown plainly, nothing to click. */
  info?: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const SEATS: CouncilSeat[] = ['grandMaster', 'champion', 'envoy', 'spymaster', 'steward', 'physician', 'elder', 'masterOfRites'];
const AILMENT: Record<string, string> = { wounded: 'their wounds', ill: 'their illness', grieving: 'their grief', godglass: 'the godglass' };

/** What they are doing right now, in a few words, or null when at home with nothing in hand. */
export function doingNow(world: World, c: Character): string | null {
  if (!c.alive) return null;
  const m = activeMissionOf(world, c.id);
  if (m) return `${m.leaderId === c.id ? 'Leading' : 'On'} a mission: ${MISSION_LABEL[m.kind].toLowerCase()}`;
  const f = (id: string) => c.flags.find((x) => x.id === id);
  if (f('captive')) return 'Held captive';
  if (f('missing')) return 'Missing';
  if (f('hunting')) return 'Hunting corsairs';
  if (f('watch')) return 'Keeping a lane watch';
  if (f('posted')) { const e = Object.values(world.embassies ?? {}).find((x) => x.ambassadorId === c.id); return e ? `Ambassador at the court of ${world.houses[e.host]?.name ?? e.host}` : 'Posted abroad'; }
  if (f('ward')) return 'A ward at another court';
  if (f('crucible')) return 'At the Crucible';
  if (f('circuit')) return 'On the tourney circuit';
  if (f('aboard')) return 'Aboard ship';
  if (f('travelling')) return 'Travelling';
  const e = enrolmentOf(world, c.id);
  if (e) return `In training (${e.program}${e.subject ? `, ${e.subject}` : ''})`;
  const post = f('veteranPost');
  if (post) return post.detail ?? 'Serving in a veteran post';
  if (f('rested')) return 'Resting from arms';
  return null;
}

export function decisionsFor(world: World, id: string): Decision[] {
  const c = world.characters[id];
  if (!c) return [];
  const P = world.playerHouseId;
  const out: Decision[] = [];
  const sheet = (): void => {
    out.push({ key: 'open', group: 'Sheet', label: 'Open their sheet', menuOnly: true, to: { kind: 'character', id } });
    out.push({ key: 'pin', group: 'Sheet', label: world.careers?.pinned.includes(id) ? 'Stop following' : 'Follow them', note: 'shown in the Hall', run: (w) => togglePin(w, id) });
    out.push({ key: 'record', group: 'Sheet', label: 'Full record', to: { kind: 'log', person: id } });
    out.push({ key: 'ties', group: 'Sheet', label: 'Their ties', to: { kind: 'people', focus: id } });
  };
  if (!c.alive) { sheet(); return out; }

  // ---- someone else's
  if (c.houseId !== P) {
    if (world.captives?.[id]?.heldBy === P) out.push({ key: 'fate', group: 'Intrigue', label: 'Decide their fate', primary: true, to: { kind: 'council' } });
    const inq = activeMissions(world, P).find((m) => m.targetId === id);
    out.push(inq
      ? { key: 'inv', group: 'Intrigue', label: 'Investigation under way', to: { kind: 'mission', id: inq.id } }
      : { key: 'inv', group: 'Intrigue', label: 'Investigate them', primary: true, to: { kind: 'plan', mission: 'investigate', target: id } });
    const watching = world.ports?.watch.includes(id);
    out.push({ key: 'watch', group: 'Intrigue', label: watching ? 'Stop watching the ports' : 'Watch the ports for them', note: 'word when they travel', run: (w) => toggleWatch(w, id) });
    if (poachable(world).some((x) => x.id === id) || c.flags.some((f) => f.id === 'approached')) {
      const odds = poachOdds(world, id, 0);
      out.push({ key: 'poach', group: 'Intrigue', label: 'Approach them to come over', why: cannotPoach(world, id, 0), note: `${POACH_APPROACH} · ~${Math.round(odds.p * 100)}%`, run: (w) => poach(w, id, 0) });
      out.push({ key: 'poach-purse', group: 'Intrigue', label: 'Approach with a purse', pageOnly: true, to: { kind: 'house', id: c.houseId } });
    }
    sheet();
    return out;
  }

  // ---- the Highroy: only the sheet
  if (c.seat === 'highroy') {
    out.push({ key: 'wisdom', group: 'Court', label: 'Sit with the Elder', why: cannotCounsel(world, P), note: 'sharper for an Orbit', run: (w) => seekWisdom(w, P, id) });
    sheet();
    return out;
  }

  const age = ageOf(c, world.date);
  const adultAge = SPECIES[c.species].adulthood;
  const young = age < adultAge;
  const away = isAway(world, id) ? 'They are away' : null;

  // ---- Court
  out.push({ key: 'audience', group: 'Court', label: 'Call before the court', note: 'an audience: they say what they want', why: cannotHoldAudience(world, id), run: (w) => holdAudience(w, id) });
  const elder = seatHolder(world, P, 'elder');
  if (elder && elder.id !== id) out.push({ key: 'wisdom', group: 'Court', label: 'Send to sit with the Elder', note: 'sharper for an Orbit', why: away ?? cannotCounsel(world, P), run: (w) => seekWisdom(w, P, id) });
  if (!young && c.tier === 'full') {
    out.push({
      key: 'seat', group: 'Court', label: c.seat ? `Move to another seat (now ${SEAT_TITLE[c.seat]})` : 'Name to a council seat', why: away,
      sub: SEATS.map((s) => {
        const holder = seatHolder(world, P, s);
        return { key: `seat:${s}`, group: 'Court' as Group, label: SEAT_TITLE[s], note: holder ? `in place of ${shortName(holder.name)}` : 'empty', why: c.seat === s ? 'They hold it' : null, run: (w: World) => appointToSeat(w, s, id) };
      }),
    });
    const hosts = Object.keys(world.houses).filter((h) => h !== P && embassy(world, h, P));
    if (hosts.length) out.push({
      key: 'amb', group: 'Court', label: 'Make ambassador', why: c.seat ? 'A councillor cannot leave their seat' : away,
      sub: hosts.map((h) => {
        const e = embassy(world, h, P)!;
        const now = e.ambassadorId ? world.characters[e.ambassadorId] : undefined;
        return { key: `amb:${h}`, group: 'Court' as Group, label: `To House ${world.houses[h]!.name}`, note: now ? `recalls ${shortName(now.name)}` : 'post empty', why: cannotAppoint(world, h, id), run: (w: World) => appointAmbassador(w, h, id) };
      }),
    });
  }
  if (isHouseholdNoble(c)) {
    const occ = occupationOf(c);
    out.push({
      key: 'occ', group: 'Court', label: `Their work: ${OCCUPATION_LABEL[occ]}`,
      sub: (['courtier', 'envoy', 'idle'] as const).map((o) => ({ key: `occ:${o}`, group: 'Court' as Group, label: OCCUPATION_LABEL[o], note: OCCUPATION_NOTE[o], why: occ === o ? 'Already' : null, run: (w: World) => setOccupation(w, P, id, o) })),
    });
  }

  const strs = openStruggles(world);
  const onIt = strs.find((s) => s.ours.includes(id));
  if (onIt) out.push({ key: 'struggle', group: 'Court', label: `Take off: ${onIt.title}`, note: 'the struggle', run: (w) => leaveStruggle(w, onIt.id, id) });
  else if (strs.length && !young) out.push({
    key: 'struggle', group: 'Court', label: 'Set to a struggle',
    sub: strs.map((s): Decision => ({ key: `str:${s.id}`, group: 'Court', label: s.title, note: `${Math.round(s.meter) >= 0 ? '+' : ''}${Math.round(s.meter)}`, why: cannotJoin(world, s, id), run: (w) => joinStruggle(w, s.id, id) })),
  });

  // ---- Arms
  const kn = cannotKnight(world, id);
  if (!kn || !['Already a knight', 'A councillor', 'Retired from arms', 'Never blooded', 'Not one of ours'].includes(kn)) {
    out.push({ key: 'knight', group: 'Arms', label: 'Knight them', note: '300 othes', primary: !kn, why: kn, run: (w) => knight(w, id) });
  }
  const free = caigesOf(world, P).filter((g) => !g.bondedTo && !g.pledgedTo);
  const bonded = c.flags.find((f) => f.id === 'caigeBonded');
  if (bonded) out.push({ key: 'caige', group: 'Arms', label: `Carries the Caige ${(bonded.detail ?? '').split(',')[0]}`.trim(), info: true, note: `since SY-${bonded.since.year}` });
  else if (free.length) {
    const g = cannotGrant(world, c);
    out.push({
      key: 'caige', group: 'Arms', label: 'Grant a Caige', why: g,
      sub: free.map((cg): Decision => {
        const adv = caigeAdvice(world, cg.id).filter((a) => a.forId === id).map((a) => (a.seat === 'champion' ? 'Champion' : 'Grand Master'));
        return { key: `caige:${cg.id}`, group: 'Arms' as Group, label: cg.name, note: `${cg.band} · ${cg.type}${adv.length ? ` · the ${adv.join(' and ')}'s pick` : ''}`, primary: adv.length > 0, run: (w: World) => bondCaige(w, cg.id, id) };
      }).concat([{ key: 'caige:advice', group: 'Arms', label: 'Hear the council on it', note: 'Champion and Grand Master', to: { kind: 'seat', id: 'grandMaster' } }]),
    });
  }
  if (isVeteran(c)) {
    for (const p of postsFor(world, c)) out.push({ key: `post:${p.key}`, group: 'Arms', label: p.label, note: p.why, why: away, run: p.run });
    if (!hasPost(c)) out.push({ key: 'rest', group: 'Arms', label: 'Let them rest', run: (w) => letRest(w, id) });
  }
  if (isMilitary(world, c) || fightScore(c) >= 10) out.push({ key: 'tourney', group: 'Arms', label: 'Enter in a tourney', to: { kind: 'grounds' } });
  if (isMilitary(world, c) || stageOf(world, id)) out.push({ key: 'knights', group: 'Arms', label: 'Knights & challenges', to: { kind: 'knights' }, pageOnly: true });
  for (const f of c.flags) {
    if (!AILMENT[f.id]) continue;
    const why = cannotAttend(world, id, f.id);
    if (why === 'Already attended' || why === 'Nothing to hurry' || why === 'Nothing to treat') continue;
    out.push({ key: `attend:${f.id}`, group: 'Arms', label: `Physician: see to ${AILMENT[f.id]}`, note: `${f.id === 'godglass' ? TREAT_COST : ATTEND_COST} othes`, why, run: (w) => attend(w, id, f.id) });
  }

  // ---- Missions
  if (!young) {
    const lead = cannotLead(world, P, c);
    out.push({ key: 'inq', group: 'Missions', label: 'Lead an inquiry', why: lead, to: { kind: 'plan', mission: 'investigate', leader: id } });
    out.push({ key: 'scout', group: 'Missions', label: 'Lead a scouting run', why: lead, to: { kind: 'plan', mission: 'scout', leader: id } });
    if (mayLeadEnvoy(c)) out.push({ key: 'envoy', group: 'Missions', label: 'Lead an envoy mission', why: lead, to: { kind: 'plan', mission: 'envoy', leader: id } });
  }
  const m = activeMissionOf(world, id);
  if (m) out.unshift({ key: 'mission', group: 'Missions', label: 'Their mission', note: MISSION_LABEL[m.kind], to: { kind: 'mission', id: m.id } });

  // ---- Learning
  if (age < adultAge * 1.6) {
    const e = enrolmentOf(world, id);
    out.push({ key: 'teach', group: 'Learning', label: e ? 'Their schooling' : 'Teach them', note: e ? `${e.program}${e.subject ? `, ${e.subject}` : ''}` : 'a tutor, or the academy', to: { kind: 'training', id } });
  }

  // ---- Intrigue
  if (c.role === ENVOY_ROLE) {
    out.push(isAgent(c)
      ? { key: 'agent', group: 'Intrigue', label: 'Release from the Spymaster', run: (w) => releaseAgent(w, id) }
      : { key: 'agent', group: 'Intrigue', label: 'Make one of the Spymaster\'s agents', note: `${agentsOf(world, P).length} of ${maxAgents(world, P)}`, why: agentsOf(world, P).length >= maxAgents(world, P) ? 'The Spymaster cannot run more agents' : null, run: (w) => recruitAgent(w, P, id) });
  }

  sheet();
  return out;
}

/** Run a decision safely: the next world, or the reason it failed. */
export function tryRun(world: World, d: Decision): { world?: World; error?: string } {
  if (!d.run) return {};
  try { return { world: d.run(world) }; } catch (e) { return { error: (e as Error).message }; }
}

export { fmt as fmtOthes };
