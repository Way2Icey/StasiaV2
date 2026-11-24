// Stories on legacy: dealers in old things, derelicts from the Silence, Rend scars, scholars and what they
// find, Keeprings forged for the honoured dead, Shardsaints that hum, objects marked CLRCH that no one
// looked for, names the court gives, ranks earned, heirs before the Hall, Echo Bearers, the Exarchon's
// Grand Marshal, lost legions' banners, thefts from the Reliquary, Navisigns and those who forge them.
// Many of these are doors: they open on something, and do not say what is behind it.
import type { Rng } from './rng';
import { addEvents, choose, fireStage, type Ctx, type EventDef } from './events';
import { econ } from './economy';
import { full, nm, seat, highroy, athome, knights, data, need, best, hasFlag, fmt } from './arckit';
import { scaled } from './variants';
import { discover, ensureLegacy, makeRelic, moveRelic, nextDrift, relicsOf, rankOf, renownOf, addDeed, earnedEpithet, RANK_LABEL, type Relic, type RelicKind } from './legacy';
import { FRAGMENT_BY_ID, SLANT_LABEL } from '../data/archive';
import { exarchonOf, houseName, liveHouses, shiftRegard, tierOf, prestigeOf } from './archon';
import { displayName } from './names';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const amt = (c: Ctx, k = 'amt') => Number(c.arc?.data?.[k] ?? c.memo?.[k] ?? 0);
const str = (c: Ctx, k: string) => String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '');
const relic = (c: Ctx, k = 'relic'): Relic | undefined => ensureLegacy(c.world).relics[str(c, k)];
const drift = (c: Ctx) => ensureLegacy(c.world).drift;
const fragLine = (id?: string) => { const f = id ? FRAGMENT_BY_ID[id] : undefined; return f ? `"${f.title}", from ${f.source.toLowerCase()} (${SLANT_LABEL[f.slant]})` : 'nothing the house did not know'; };
const ours = (c: Ctx, kinds: RelicKind[]) => relicsOf(c.world, c.house).filter((r) => kinds.includes(r.kind));
const scholars = (c: Ctx) => athome(c, true).filter((x) => x.traits.some((t) => t.id === 'archivist' || t.id === 'scholar') || x.stats.intellect >= 15);
/** Worlds of ours, or out on the frontier, where the old war or the Rend left things behind. */
const oldSites = (c: Ctx) => Object.values(c.world.archon?.frontier ?? {}).filter((x) => x.hazard === 'warwreck' || x.hazard === 'drift' || x.region === 'the Silent Belt' || x.region === 'the Old Front');

const learn = (c: Ctx, via: string, o: Parameters<typeof discover>[2] = {}) => {
  const f = discover(c.world, via, { rng: c.rng, ...o });
  if (f) c.fx.say(`For the Archive: ${fragLine(f.id)}`);
  return f;
};

const DEAL_KINDS: [RelicKind, number][] = [['echoCoin', 3], ['banner', 2], ['writ', 2], ['warNavisium', 1.5], ['stationLog', 2], ['clrch', 0.12]];

const evs: EventDef[] = [
  {
    id: 'leg:dealer', title: 'A dealer in old things', category: 'Legacy', trigger: 'home', weight: 1.4,
    setup: (c) => { const k = c.rng.weighted(DEAL_KINDS); data(c).kind = k; data(c).amt = k === 'clrch' ? scaled(c, 120) : scaled(c, k === 'warNavisium' ? 900 : 500); data(c).fake = k === 'clrch' ? 0 : c.rng.chance(0.3) ? 1 : 0; return true; },
    text: (c) => {
      const k = str(c, 'kind') as RelicKind;
      const what: Record<RelicKind, string> = {
        echoCoin: 'an Echo Coin, worn smooth, that he swears holds a moment from before the Rend',
        banner: 'the banner of a legion that never came back from the Old Front',
        writ: 'a crusade writ from the days of Vaelor Primus',
        warNavisium: 'a block of navisium dug from an old battlefield, heavy with what it saw',
        stationLog: 'a station log from the Silence, its last entries unread',
        clrch: 'a grey object marked with five letters, CLRCH, that he cannot sell to anyone. It is heavier than it should be. He wants it gone',
        keepring: '', shardsaint: '', navisign: '',
      };
      return `A dealer in old things has come to the court with ${what[k]}. He asks ${fmt(amt(c))} othes.`;
    },
    options: [
      { label: 'Buy it', labelFor: (c) => `Buy it (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)); if (amt(c, 'fake')) { c.fx.say('A fake, and a good one. The dealer is long gone'); return; } const r = makeRelic(c.world, str(c, 'kind') as RelicKind, { origin: 'bought from a dealer in old things', rng: c.rng }); c.fx.say(`${r.name} comes into the Reliquary`); } },
      { label: 'Have it looked at first', hint: 'a scholar, or the Spymaster', check: { who: (c) => best(scholars(c), (x) => x.stats.intellect) ?? seat(c, 'spymaster'), stats: ['intellect', 'insight'], dc: 12 },
        resolve: (c, ok) => { if (!ok) { c.fx.say('No one can say if it is real; the dealer will not wait'); return; } if (amt(c, 'fake')) { c.fx.say('A fake. The dealer is shown the gate'); return; } if (econ(c.world, c.house).stock.othes < amt(c)) { c.fx.say('Real, but we cannot pay what he asks'); return; } c.fx.othes(-amt(c)); const r = makeRelic(c.world, str(c, 'kind') as RelicKind, { origin: 'bought from a dealer, and checked', rng: c.rng }); c.fx.say(`Real. ${r.name} comes into the Reliquary`); } },
      { label: 'Send him away', resolve: (c) => { c.fx.say('He goes on to the next court'); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:derelict', title: 'A derelict from the Silence', arc: 'The derelict', category: 'Legacy', trigger: 'home', weight: 1.2,
    setup: (c) => { const s = oldSites(c); if (!s.length) return false; const x = c.rng.pick(s); data(c).site = x.name; data(c).region = x.region; return true; },
    text: (c) => `Surveyors near ${str(c, 'site')}, in ${str(c, 'region')}, have found a station adrift since the Silence. Its docking ring still holds air. No one has been aboard since contact between the stars ceased.`,
    options: [
      { label: 'Send a party aboard', hint: 'a knight leads; there may be things still awake', check: { who: (c) => best(knights(c), (x) => x.stats.perception + x.stats.valor), stats: ['perception', 'valor'], dc: 12 },
        resolve: (c, ok) => {
          const k = best(knights(c), (x) => x.stats.perception + x.stats.valor);
          if (ok) {
            const r = makeRelic(c.world, 'stationLog', { origin: `recovered from a derelict near ${str(c, 'site')}`, rng: c.rng });
            c.fx.say(`${nm(k)} brings back ${r.name}`);
            if (c.rng.chance(0.45)) { const e = makeRelic(c.world, 'echoCoin', { origin: 'found in a derelict\'s chapel', rng: c.rng }); c.fx.say(`and ${e.name.toLowerCase()} from its chapel`); }
            if (k) addDeed(c.world, k.id, 'discovery', `Led the boarding of a derelict from the Silence near ${str(c, 'site')}`, 2);
            if (c.rng.chance(0.03)) { const x = makeRelic(c.world, 'clrch', { origin: 'found in a sealed locker on a derelict, where no one had been looking', rng: c.rng }); c.fx.say(`In a sealed locker, among nothing else: ${x.name.toLowerCase()}`); }
          } else { c.fx.wound(k).say('The station\'s systems woke. The party came back short'); }
        } },
      { label: 'Sell the location to scavengers', resolve: (c) => { c.fx.othes(scaled(c, 400)).honour(-1); } },
      { label: 'Leave it to the dark', resolve: (c) => { c.fx.say('Some doors are better left'); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:scar', title: 'A Rend scar flares', category: 'Legacy', trigger: 'home', weight: 1,
    setup: (c) => { const s = Object.values(c.world.archon?.frontier ?? {}).filter((x) => x.hazard === 'drift'); if (!s.length || drift(c) < 35) return false; data(c).site = c.rng.pick(s).name; return true; },
    text: (c) => `Out at ${str(c, 'site')}, where the Rend tore deepest, the ground has started to hum again. Miners who work near it are dreaming of a wide river. Navisium there comes up heavier than it went in.`,
    options: [
      { label: 'Mine it while it gives', hint: 'war-navisium; the miners will pay for it', resolve: (c) => { const r = makeRelic(c.world, 'warNavisium', { origin: `dug from the Rend scar at ${str(c, 'site')}`, rng: c.rng, name: `Scar-navisium from ${str(c, 'site')}` }); c.fx.good('navisium', 40).say(`${r.name} comes in with the ore`); if (c.rng.chance(0.4)) c.fx.say('Three miners will not stop dreaming'); } },
      { label: 'Send scholars to sit with it', hint: 'the Archive', resolve: (c) => { learn(c, `the Rend scar at ${str(c, 'site')}`, { thread: c.rng.chance(0.6) && nextDrift(c.world) ? 'drift' : 'souls' }); } },
      { label: 'Close the site', resolve: (c) => { c.fx.respect(-1).say('The scar is fenced off and left'); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:scholar', title: 'A scholar\'s discovery', category: 'Legacy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const s = scholars(c); if (!s.length) return false; const f = discover(c.world, 'held back', { rng: c.rng }); if (!f) return false; delete ensureLegacy(c.world).archive[f.id]; data(c).frag = f.id; return choose(c, { personId: c.rng.pick(s).id }); },
    text: (c) => { const f = FRAGMENT_BY_ID[str(c, 'frag')]; return `${full(c.person)} has been in the archives for an Orbit and come out with something: ${f ? `"${f.title}", from ${f.source.toLowerCase()}` : 'a fragment'}. ${f?.disputes ? 'It says the opposite of something already in our keeping.' : 'It is not what anyone expected.'}`; },
    options: [
      { label: 'Put it in the Archive and share it', hint: 'other houses will read it too', resolve: (c) => { learn(c, `found by ${nm(c.person)}`, { id: str(c, 'frag') }); c.fx.respect(1).mood(c.person, 6); if (c.person) addDeed(c.world, c.person.id, 'discovery', `Found "${FRAGMENT_BY_ID[str(c, 'frag')]?.title}" in the archives`, 1); } },
      { label: 'Keep it in our own Archive', resolve: (c) => { learn(c, `found by ${nm(c.person)}`, { id: str(c, 'frag') }); c.fx.mood(c.person, 2); } },
      { label: 'Burn it', hint: 'some things should not be read', resolve: (c) => { c.fx.mood(c.person, -10).say('The pages burn. The scholar watches them burn'); } },
    ],
    fallback: 1,
  },
  {
    id: 'leg:forge', title: 'A Keepring for the dead', category: 'Legacy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const L = ensureLegacy(c.world); const h = L.hall.find((x) => x.died >= c.world.date.year - 1 && x.deeds.length >= 2 && !Object.values(L.relics).some((r) => r.of === x.id)); if (!h) return false; data(c).dead = h.id; data(c).amt = scaled(c, 600); return true; },
    text: (c) => { const d = c.world.characters[str(c, 'dead')]; return `${d ? full(d) : 'One of our honoured dead'} is laid in the Hall. The old way is to forge a Keepring Blade from pure navisium, to carry their grief and their name down the line. The smiths ask 40 navisium and ${fmt(amt(c))} othes.`; },
    options: [
      { label: 'Forge it', available: (c) => (econ(c.world, c.house).stock.navisium < 40 ? 'Needs 40 navisium' : need(amt(c))(c)), resolve: (c) => { c.fx.othes(-amt(c)).good('navisium', -40); const r = makeRelic(c.world, 'keepring', { of: str(c, 'dead'), origin: 'forged at the funeral', rng: c.rng }); c.fx.honour(1).moodAll(athome(c, true), 3, 'the court').say(`${r.name} is forged, and given to the heir`); } },
      { label: 'A plain stone in the Hall is enough', resolve: (c) => { c.fx.say('The name is cut in stone'); } },
    ],
    fallback: 1,
  },
  {
    id: 'leg:shrine', title: 'The Shardsaint hums', category: 'Legacy', trigger: 'home', weight: 1.5,
    setup: (c) => { const s = ours(c, ['shardsaint']); if (!s.length) return false; data(c).relic = c.rng.pick(s).id; return true; },
    text: (c) => `${relic(c)?.name} has begun to hum at night. Servants who pass it weep without knowing why. People have started to come from the lower city to stand near it, and some of them say they can hear the moment it holds.`,
    options: [
      { label: 'Open it to pilgrims', hint: 'coin and fame; unrest at the gates', resolve: (c) => { c.fx.othes(scaled(c, 300)).respect(2).unrest(undefined, 2); } },
      { label: 'Let scholars sit with it', resolve: (c) => { learn(c, `sitting with ${relic(c)?.name}`, { thread: c.rng.chance(0.5) && nextDrift(c.world) ? 'drift' : 'souls' }); } },
      { label: 'Veil it', resolve: (c) => { c.fx.say('It is covered, and the humming does not stop'); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:marked', title: 'The marked object', category: 'Legacy', trigger: 'home', weight: 0.6,
    setup: (c) => { const s = ours(c, ['clrch']); if (!s.length) return false; data(c).relic = c.rng.pick(s).id; data(c).turn = c.rng.int(0, 3); return true; },
    text: (c) => {
      const r = relic(c);
      return [
        `The keeper of the Reliquary swears that ${r?.name.toLowerCase()} was moved in the night. The vault was sealed. Nothing else was touched.`,
        `A bonded knight walked past ${r?.name.toLowerCase()} today, and for a moment their Caige went quiet in their hand, as if it were listening.`,
        `${r?.name} weighs more today than it did when it was weighed last year. The scales are true.`,
        `A child of the household asked what the letters on ${r?.name.toLowerCase()} say. Nobody could answer, and the child asked why everyone had gone quiet.`,
      ][amt(c, 'turn')]!;
    },
    options: [
      { label: 'Lock it deeper', resolve: (c) => { c.fx.say('It goes into the deepest vault, and the vault is sealed'); } },
      { label: 'Give it to the scholars', resolve: (c) => { const f = learn(c, `study of ${relic(c)?.name}`, { thread: 'clrch' }); if (!f) c.fx.say('The scholars find nothing they did not know. They ask to keep studying'); } },
      { label: 'Keep it close', hint: 'the Highroy carries it', resolve: (c) => { const h = highroy(c); if (h && relic(c)) { relic(c)!.bearer = h.id; relic(c)!.history.push({ year: c.world.date.year, text: `Carried by ${displayName(h.name)}` }); } c.fx.say('Nothing happens. Nothing has ever happened'); } },
    ],
    fallback: 0,
  },
  {
    id: 'leg:unlooked', title: 'Five letters', category: 'Legacy', trigger: 'home', weight: 0.07,
    setup: (c) => { data(c).where = c.rng.pick(['in the pocket of a dead courier', 'at the bottom of a crate of Exchange metals', 'in a vault no one had opened since the Silence', 'in the hand of a beggar, who would not say where he got it', 'in the wreck of a corsair skiff']); return true; },
    text: (c) => `Something was found ${str(c, 'where')}: a dense grey object, cold to the touch, marked with five letters, CLRCH. Nobody was looking for it.`,
    options: [
      { label: 'Keep it', resolve: (c) => { const r = makeRelic(c.world, 'clrch', { origin: `found ${str(c, 'where')}`, rng: c.rng }); c.fx.say(`${r.name} comes into the Reliquary`); } },
      { label: 'Send it to the Numarade', hint: 'let the Exarchon puzzle over it', resolve: (c) => { const ex = exarchonOf(c.world); const r = makeRelic(c.world, 'clrch', { houseId: ex?.houseId ?? null, origin: `found ${str(c, 'where')}, and sent to the Numarade`, rng: c.rng }); if (ex) shiftRegard(c.world, ex.houseId, c.house, 6); c.fx.say(`${r.name} goes to the Numarade`); } },
      { label: 'Throw it into a sun', resolve: (c) => { c.fx.say('It goes into the sun. Nobody feels better for it'); } },
    ],
    fallback: 0,
  },
  {
    id: 'leg:epithet', title: 'A name earned', category: 'Legacy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person && !c.person.name.epithet && !!str(c, 'epithet'),
    text: (c) => `The court has started calling ${full(c.person)} "${str(c, 'epithet')}". It began in the barracks, after ${ensureLegacy(c.world).deeds[c.person!.id]?.[0]?.text.toLowerCase() ?? 'what they did'}, and now even the servants say it.`,
    options: [
      { label: 'Let the name stand', resolve: (c) => { c.person!.name.epithet = str(c, 'epithet'); ensureLegacy(c.world).counters.epithets = (ensureLegacy(c.world).counters.epithets ?? 0) + 1; c.fx.mood(c.person, 10).respect(1); } },
      { label: 'Make it official, at a feast', hint: '−300 othes', available: need(300), resolve: (c) => { c.person!.name.epithet = str(c, 'epithet'); ensureLegacy(c.world).counters.epithets = (ensureLegacy(c.world).counters.epithets ?? 0) + 1; c.fx.othes(-300).mood(c.person, 16).respect(2); } },
      { label: 'Forbid it', hint: 'no one is bigger than the house', resolve: (c) => { c.fx.mood(c.person, -10).thread(c.person, 'grudge', 'Forbidden the name the court gave them'); } },
    ],
    fallback: 0,
  },
  {
    id: 'leg:rank', title: 'Raised in rank', category: 'Legacy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person && !!rankOf(c.world, c.person.id),
    text: (c) => `${full(c.person)} is raised ${RANK_LABEL[rankOf(c.world, c.person!.id)!]} by the Grand Master, for deeds the whole house knows. The rank is old: it comes down from the legions of the war, ten to each above.`,
    options: [
      { label: 'Before the whole house', hint: '−200 othes', available: need(200), resolve: (c) => { c.fx.othes(-200).mood(c.person, 12).respect(1); for (const k of knights(c)) if (k.id !== c.person?.id && renownOf(c.world, k.id) >= renownOf(c.world, c.person!.id) - 1) c.fx.mood(k, -4); } },
      { label: 'Quietly, in the yard', resolve: (c) => { c.fx.mood(c.person, 5); } },
      { label: 'Give them the vanguard', hint: 'a vow to keep', resolve: (c) => { c.fx.mood(c.person, 8).thread(c.person, 'vow', 'Given the vanguard of the legion, and sworn to hold it'); } },
    ],
    fallback: 1,
  },
  {
    id: 'leg:hall', title: 'Before the Hall', category: 'Legacy', trigger: 'home', weight: 1,
    setup: (c) => {
      const L = ensureLegacy(c.world);
      const dead = L.hall.filter((h) => h.deeds.length >= 2);
      const young = athome(c).filter((x) => x.id !== highroy(c)?.id && renownOf(c.world, x.id) < 3 && x.stats.valor + x.stats.leadership >= 18);
      if (!dead.length || !young.length) return false;
      data(c).dead = c.rng.pick(dead).id;
      return choose(c, { personId: c.rng.pick(young).id });
    },
    text: (c) => { const h = ensureLegacy(c.world).hall.find((x) => x.id === str(c, 'dead')); return `${full(c.person)} has been seen standing in the Hall before the name of ${h?.name}${h?.epithet ? `, ${h.epithet}` : ''}, who ${h?.deeds[0]?.toLowerCase() ?? 'was much spoken of'}. They have asked the old knights what that one was like.`; },
    options: [
      { label: 'Tell them to match it', hint: 'ambition, and the weight of it', resolve: (c) => { c.fx.mood(c.person, 4).thread(c.person, 'vow', `Sworn to be spoken of like ${ensureLegacy(c.world).hall.find((x) => x.id === str(c, 'dead'))?.name}`); } },
      { label: 'Tell them to be their own', resolve: (c) => { c.fx.mood(c.person, 6); } },
      { label: 'Say nothing', resolve: (c) => { if (c.rng.chance(0.4)) c.fx.mood(c.person, -4).say('They take the silence for an answer'); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:echo', title: 'In step', category: 'Legacy', trigger: 'home', weight: 1,
    setup: (c) => { if (drift(c) < 50) return false; const b = athome(c).filter((x) => hasFlag(x, 'caigeBonded')); if (!b.length) return false; return choose(c, { personId: c.rng.pick(b).id }); },
    text: (c) => `${full(c.person)} has started finishing the sentences of strangers. They dream of a wide river with everyone in it walking the same way, and they wake calm, which frightens the Physician more than nightmares would.`,
    options: [
      { label: 'Have them watched and written down', hint: 'the Archive', resolve: (c) => { const f = learn(c, `watching ${nm(c.person)}`, { thread: 'drift' }); if (!f) c.fx.say('Nothing new: the same river, the same calm'); } },
      { label: 'Keep them from their Caige a while', resolve: (c) => { const g = Object.values(c.world.armoury).find((x) => x.bondedTo === c.person?.id); if (g) g.cdi = Math.max(0.05, (g.cdi ?? 0.5) - 0.05); c.fx.mood(c.person, -5).say('The dreams thin out. So does the bond'); } },
      { label: 'Let it be', resolve: (c) => { if (c.person) c.person.hidden.drift += 2; c.fx.say('They seem happier than they have ever been'); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:marshal', title: 'The Grand Marshal', category: 'Legacy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => {
      const ex = exarchonOf(c.world); if (!ex) return false;
      const L = ensureLegacy(c.world);
      if (Object.entries(L.ranks).some(([id, r]) => r === 'grandMarshal' && c.world.characters[id]?.alive)) return false;
      const pool = Object.values(c.world.characters).filter((x) => x.alive && x.tier === 'full' && (rankOf(c.world, x.id) === 'highKnight' || x.seat === 'grandMaster'));
      if (!pool.length) return false;
      const ourPick = ex.houseId === c.house;
      const candidates = ourPick ? pool.filter((x) => x.houseId === c.house) : pool;
      const pick = best(candidates, (x) => renownOf(c.world, x.id) * 2 + x.stats.leadership + (x.houseId === ex.houseId ? 6 : 0) + (x.houseId === c.house ? 2 : 0));
      if (!pick) return false;
      data(c).ours = ourPick ? 1 : 0;
      return choose(c, { personId: pick.id, otherHouseId: ex.houseId });
    },
    text: (c) => amt(c, 'ours') ? `The Exarchon, of our own blood, must name a Grand Marshal to command the legions of the Archon. The court's choice is ${full(c.person)}, but the choice is the Highroy's.`
      : `The Exarchon has named a Grand Marshal to command the legions of the Archon: ${full(c.person)}, of House ${houseName(c.world, c.person!.houseId)}.${c.person!.houseId === c.house ? ' One of ours.' : ''}`,
    options: [
      { label: 'So be it', resolve: (c) => { const p = c.person!; ensureLegacy(c.world).ranks[p.id] = 'grandMarshal'; addDeed(c.world, p.id, 'command', `Named Grand Marshal of the Archon, ${c.world.date.year}`, 5); if (p.houseId === c.house) { ensureLegacy(c.world).counters.marshals = (ensureLegacy(c.world).counters.marshals ?? 0) + 1; c.fx.respect(3).mood(p, 15); } else c.fx.say(`House ${houseName(c.world, p.houseId)} rises in the Archon's eyes`); } },
    ],
    fallback: 0,
  },
  {
    id: 'leg:banner', title: 'A claim on the banner', category: 'Legacy', trigger: 'home', weight: 1,
    setup: (c) => { const b = ours(c, ['banner']); const hs = liveHouses(c.world).filter((h) => h.id !== c.house); if (!b.length || !hs.length) return false; data(c).relic = c.rng.pick(b).id; return choose(c, { otherHouseId: c.rng.pick(hs).id }); },
    text: (c) => `House ${houseName(c.world, c.other ?? '')} says that ${relic(c)?.name.replace(/^The /, 'the ')} is theirs: their blood marched under it, and their dead are still out on the Old Front. They want it back.`,
    options: [
      { label: 'Give it to them', resolve: (c) => { moveRelic(c.world, str(c, 'relic'), c.other ?? null, `Returned to House ${houseName(c.world, c.other ?? '')}`); c.fx.regard(c.other, 15).honour(3); } },
      { label: 'Fly it together, once a year', resolve: (c) => { c.fx.regard(c.other, 6).honour(1).say('A shared parade, every year, under the old banner'); } },
      { label: 'Refuse', resolve: (c) => { c.fx.regard(c.other, -12); } },
    ],
    fallback: 2,
  },
  {
    id: 'leg:theft', title: 'A theft from the Reliquary', category: 'Legacy', trigger: 'home', weight: 0.8,
    setup: (c) => { const rs = relicsOf(c.world, c.house).filter((r) => r.kind !== 'navisign'); if (rs.length < 3) return false; data(c).relic = c.rng.pick(rs).id; data(c).guarded = ours(c, ['navisign']).length ? 1 : 0; return true; },
    text: (c) => `${relic(c)?.name} is gone from the Reliquary. The seals were cut by someone who knew where they were.${amt(c, 'guarded') ? ' The house\'s Navisign marked it; it can be traced.' : ''}`,
    options: [
      { label: 'Set the Spymaster on it', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 13 },
        resolve: (c, ok) => { if (ok || (amt(c, 'guarded') && c.rng.chance(0.6))) c.fx.dread(2).say('Found, and the thief with it'); else { moveRelic(c.world, str(c, 'relic'), null, 'Stolen from the Reliquary'); c.fx.respect(-1).say('Gone. It will turn up in a dealer\'s stall some day'); } } },
      { label: 'Let it go quietly', resolve: (c) => { moveRelic(c.world, str(c, 'relic'), null, 'Stolen from the Reliquary'); } },
    ],
    fallback: 0,
  },
  {
    id: 'leg:navisign', title: 'An artificer of Navisigns', category: 'Legacy', trigger: 'home', weight: 0.8,
    setup: (c) => { if (ours(c, ['navisign']).length) return false; if (!Object.values(c.world.armoury).some((g) => g.houseId === c.house)) return false; data(c).amt = scaled(c, 800); return true; },
    text: (c) => `An artificer offers to thread a Navisign for the house: navisium filaments that answer only to our blood, so that a Caige of ours will not answer a thief or a pretender. ${fmt(amt(c))} othes and 20 navisium.`,
    options: [
      { label: 'Thread it', available: (c) => (econ(c.world, c.house).stock.navisium < 20 ? 'Needs 20 navisium' : need(amt(c))(c)), resolve: (c) => { c.fx.othes(-amt(c)).good('navisium', -20); const r = makeRelic(c.world, 'navisign', { origin: 'threaded for the house by an artificer', rng: c.rng }); c.fx.say(`${r.name} is threaded into the Highroy's ring`); } },
      { label: 'Not now', resolve: () => {} },
    ],
    fallback: 1,
  },
  {
    id: 'leg:forger', title: 'A signature forger', category: 'Legacy', trigger: 'home', weight: 0.5,
    setup: (c) => { const theirs = Object.values(c.world.armoury).filter((g) => g.houseId !== c.house && !g.bondedTo); if (!theirs.length) return false; const g = c.rng.pick(theirs); data(c).caige = g.name; data(c).amt = scaled(c, 1500); return choose(c, { otherHouseId: g.houseId }); },
    text: (c) => `A woman who forges Navisigns came to the Spymaster privately. With ${fmt(amt(c))} othes she can make a signature that ${str(c, 'caige')}, in House ${houseName(c.world, c.other ?? '')}'s vault, would take for its own. What we did with that would be up to us.`,
    options: [
      { label: 'Pay her, and keep the signature', hint: 'a door; if it comes out, a scandal', available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).thread(seat(c, 'spymaster'), 'secret', `Holds a forged Navisign for ${str(c, 'caige')}`); if (c.rng.chance(0.2)) c.fx.honour(-5).regard(c.other, -15).say('It comes out'); } },
      { label: 'Hand her to the Numarade', resolve: (c) => { c.fx.honour(2).regard(c.other, 4); } },
      { label: 'Show her the door', resolve: () => {} },
    ],
    fallback: 2,
  },
  {
    id: 'leg:spoils', title: 'Among the spoils', category: 'Legacy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => { data(c).kind = c.rng.pick(['banner', 'writ', 'warNavisium', 'echoCoin']); return true; },
    text: (c) => `Among what the soldiers brought home from the war is something older than the war: ${({ banner: 'a legion\'s banner, brown with age', writ: 'a crusade writ in a sealed case', warNavisium: 'a block of war-navisium from the old fronts', echoCoin: 'an Echo Coin, still humming' } as Record<string, string>)[str(c, 'kind')]}.`,
    options: [
      { label: 'Into the Reliquary', resolve: (c) => { const r = makeRelic(c.world, str(c, 'kind') as RelicKind, { origin: 'taken among the spoils of war', rng: c.rng }); c.fx.say(`${r.name} comes into the Reliquary`); } },
      { label: 'Give it to the soldiers who found it', resolve: (c) => { c.fx.say('The legion keeps it'); for (const f of Object.values(c.world.war?.formations ?? {})) if (f.houseId === c.house) f.morale = clamp(f.morale + 4, 0, 100); } },
    ],
    fallback: 0,
  },
];

addEvents(evs);

/** Once a year: the stories the legacy system tells on its own schedule. */
export function legacyStories(w: World, rng: Rng, promoted: Character[]): void {
  const P = w.playerHouseId;
  const L = ensureLegacy(w);
  // Names earned by our people.
  for (const c of Object.values(w.characters)) {
    if (!c.alive || c.houseId !== P || c.tier !== 'full' || c.name.epithet) continue;
    const e = earnedEpithet(w, c, rng);
    if (e) { fireStage(w, rng, 'leg:epithet', { personId: c.id, stakes: { epithet: e } }); break; }
  }
  for (const c of promoted.filter((x) => x.houseId === P).slice(0, 2)) fireStage(w, rng, 'leg:rank', { personId: c.id });
  if (rng.chance(0.35)) fireStage(w, rng, 'leg:scholar', {});
  fireStage(w, rng, 'leg:forge', {});
  if (rng.chance(0.5)) fireStage(w, rng, 'leg:marshal', {});
  // A war won lately may have left something old among the spoils.
  const won = (w.war?.wars ?? []).find((x) => x.status === 'ended' && x.result && w.date.year - x.result.date.year <= 1 && !L.seen[`spoils:${x.id}`] && (x.result.winner === (x.attacker === P || x.attackers.includes(P) ? 'attackers' : x.defender === P || x.defenders.includes(P) ? 'defenders' : '')));
  if (won) { L.seen[`spoils:${won.id}`] = true; if (rng.chance(0.6)) fireStage(w, rng, 'leg:spoils', {}); }
}


/** Give a relic to another house: a gift they will remember. */
export function giftRelic(input: World, id: string, to: string): World {
  const w = structuredClone(input);
  const r = ensureLegacy(w).relics[id];
  if (!r || r.houseId !== w.playerHouseId) throw new Error('Not in our keeping.');
  moveRelic(w, id, to, `Given to House ${houseName(w, to)}`);
  shiftRegard(w, to, w.playerHouseId, r.kind === 'clrch' ? 4 : r.kind === 'keepring' || r.kind === 'shardsaint' ? 14 : 9);
  return w;
}

/** What standing the house has and what the next height needs: for the Legacy page. */
export function ascent(w: World): { tier: 'great' | 'minor'; prestige: number; lowestGreat?: { id: string; name: string; prestige: number }; exarchon: boolean } {
  const greats = liveHouses(w).filter((h) => h.tier === 'great').sort((a, b) => a.prestige - b.prestige);
  const low = greats[0];
  return { tier: tierOf(w, w.playerHouseId), prestige: prestigeOf(w, w.playerHouseId), lowestGreat: low ? { id: low.id, name: low.name, prestige: low.prestige } : undefined, exarchon: exarchonOf(w)?.houseId === w.playerHouseId };
}
