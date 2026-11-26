// The command bar: press / or Ctrl-K, type what you want to do or who you want, and go.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav, useWorld } from './context';
import { displayName } from '../sim/names';
import { SEAT_TITLE } from '../sim/world';
import type { Route } from './router';
import type { World } from '../sim/types';

interface Hit { label: string; hint: string; to: Route; words: string }

/** The things a Highroy does, and where each is done. */
const VERBS: [string, string, Route][] = [
  ['Answer the desk', 'decisions, audiences, letters', { kind: 'throne' }],
  ['Raise our Crucible contingent', 'crucible muster marshal champion knights', { kind: 'crucible' }],
  ['Read the reports on the drawn houses', 'crucible intel agents doctrine', { kind: 'crucible' }],
  ['Send agents to watch a house', 'crucible spies report', { kind: 'crucible' }],
  ['Give the Marshal orders', 'crucible plan aim counter stance', { kind: 'crucible' }],
  ['Call the house tourney', 'tourney tournament bracket', { kind: 'grounds' }],
  ['Host a tourney for the circuit', 'host public invitational tourney', { kind: 'grounds' }],
  ['Send fighters to a tourney or pit night', 'circuit pits enter send', { kind: 'grounds' }],
  ['Forbid or allow the underground pits', 'pits rule ban', { kind: 'grounds' }],
  ['Allow or forbid a challenge', 'duel challenge', { kind: 'knights' }],
  ['Knight someone', 'knight dub', { kind: 'knights' }],
  ['Lay down a ship', 'commission ship shipyard fleet build', { kind: 'fleet' }],
  ['Give a ship its duty', 'fleet captain patrol escort', { kind: 'fleet' }],
  ['Build an academy', 'build academy school', { kind: 'build', what: 'academy' }],
  ['Build a vault', 'build vault reserves', { kind: 'build', what: 'vault' }],
  ['Build cells', 'build cells prison', { kind: 'build', what: 'cells' }],
  ['Build a base', 'build base garrison military', { kind: 'build', what: 'base' }],
  ['Build a listening post', 'build listening post sensors ears', { kind: 'build', what: 'listening' }],
  ['Build a shipyard', 'build shipyard', { kind: 'build', what: 'shipyard' }],
  ['Put othes in a vault', 'deposit reserves vault', { kind: 'vaults' }],
  ['Lend or borrow othes', 'loan debt credit', { kind: 'loans' }],
  ['Set how we pay our knights', 'pay stipend wages salary', { kind: 'spend' }],
  ['Fund the Crucible bid', 'crucible fund kit provisions', { kind: 'spend' }],
  ['Pay the Numarade for the draw', 'bribe numarade draw', { kind: 'spend' }],
  ['Begin a great work', 'great work spire archive arena monument', { kind: 'spend' }],
  ['Blood an aspirant', 'blood blooding aspirant ceremony', { kind: 'knights' }],
  ['The house trials', 'trials exam pupils aspirants', { kind: 'knights' }],
  ['Trade at the Exchange', 'buy sell market prices exchange', { kind: 'economy' }],
  ['Set taxes', 'tax ledger income', { kind: 'economy' }],
  ['Appoint an ambassador', 'embassy ambassador envoy abroad', { kind: 'embassies' }],
  ['Tutor a child', 'tutor teach pupil training', { kind: 'training' }],
  ['Enrol someone at the academy', 'academy enrol student training', { kind: 'training' }],
  ['Take in the academy intake', 'intake educate train pupils', { kind: 'training' }],
  ['Drill the knights', 'drill training', { kind: 'training' }],
  ['Wards and younglings', 'ward young children diamonds prospects', { kind: 'people', view: 'young' }],
  ['Ambitions and audiences', 'ambition want audience will', { kind: 'people', view: 'ambitions' }],
  ['Ties and friendships', 'relationships opinion friends rivals', { kind: 'people', view: 'web' }],
  ['Factions at court', 'factions cliques', { kind: 'people', view: 'factions' }],
  ['Swear an oath', 'oath council', { kind: 'council' }],
  ['Name someone to the council', 'seat appoint councillor', { kind: 'council' }],
  ['Petitions', 'petition council asks', { kind: 'council' }],
  ['The infirmary', 'physician wounded ill heal', { kind: 'seat', id: 'physician' }],
  ['Plan an investigation', 'mission investigate spy look into', { kind: 'plan', mission: 'investigate' }],
  ['Plan a scouting run', 'mission scout world', { kind: 'plan', mission: 'scout' }],
  ['Send an envoy', 'mission envoy diplomacy', { kind: 'plan', mission: 'envoy' }],
  ['Leads and prospects', 'leads prospect recruit noticed', { kind: 'missions' }],
  ['Captives and ransoms', 'captive prisoner ransom interrogate', { kind: 'throne' }],
  ['Lanes and convoys', 'lanes convoy trade shipping cargo routes', { kind: 'lanes' }],
  ['Set our customs post', 'customs strict blind eye smuggling contraband', { kind: 'lanes' }],
  ['Deal with the corsairs', 'corsairs pirates passage bounty marque privateer letters', { kind: 'lanes' }],
  ['Propose a trade compact', 'compact trade agreement partner house', { kind: 'lanes' }],
  ['Hunt a corsair captain', 'hunt corsair captain pirate knights company', { kind: 'lanes' }],
  ['Grant a Caige', 'caige grant bond armoury', { kind: 'seat', id: 'grandMaster' }],
  ['Renown across the houses', 'renown fame famous legend rank', { kind: 'people', view: 'renown' }],
  ['Find posts for veterans', 'veteran retired old knights elder teacher', { kind: 'knights' }],
  ['Hold or blockade a lane', 'lane watch blockade secure ships', { kind: 'lanes' }],
  ['Declare an embargo', 'embargo trade ban', { kind: 'lanes' }],
  ['Rival convoys we know of', 'intelligence convoy tip spy', { kind: 'lanes' }],
  ['Alliances and feuds', 'alliance ally feud peace reparations aims numarade favour', { kind: 'houses' }],
  ['Bring over a rival knight', 'poach defect lure knight offer', { kind: 'houses' }],
  ['Star map', 'map worlds planets ports raids', { kind: 'worlds' }],
  ['Our holdings', 'holdings modules', { kind: 'holdings' }],
  ['The log', 'chronicle history records', { kind: 'log' }],
  ['Save or load', 'save load new game', { kind: 'save' }],
  ['Change the house colours', 'theme colour color amber green blue phosphor settings', { kind: 'save' }],
  ['Glossary', 'help terms rules', { kind: 'glossary' }],
];

function index(world: World): Hit[] {
  const hits: Hit[] = VERBS.map(([label, words, to]) => ({ label, hint: 'do', to, words: `${label} ${words}`.toLowerCase() }));
  const P = world.playerHouseId;
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.tier !== 'full') continue;
    const name = displayName(c.name);
    hits.push({ label: name, hint: `${c.houseId === P ? 'ours' : world.houses[c.houseId]?.name ?? ''} · ${c.seat ? SEAT_TITLE[c.seat] : c.role}`, to: { kind: 'character', id: c.id }, words: name.toLowerCase() });
  }
  for (const h of Object.values(world.houses)) hits.push({ label: `House ${h.name}`, hint: 'house', to: { kind: 'house', id: h.id }, words: `house ${h.name}`.toLowerCase() });
  for (const p of Object.values(world.planets)) {
    hits.push({ label: p.name, hint: 'world', to: { kind: 'planet', id: p.id }, words: p.name.toLowerCase() });
    for (const s of p.sectors) hits.push({ label: s.name, hint: `sector · ${p.name}`, to: { kind: 'sector', id: s.id }, words: `${s.name} ${p.name}`.toLowerCase() });
  }
  return hits;
}

function score(h: Hit, q: string[]): number {
  let n = 0;
  for (const t of q) {
    const i = h.words.indexOf(t);
    if (i < 0) return -1;
    n += i === 0 || h.words[i - 1] === ' ' ? 3 : 1;
  }
  return n + (h.hint === 'do' ? 2 : 0);
}

export function CommandBar({ onClose, initial = '' }: { onClose: () => void; initial?: string }) {
  const world = useWorld();
  const nav = useNav();
  const [q, setQ] = useState(initial);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => index(world), [world]);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = terms.length
    ? all.map((h) => [h, score(h, terms)] as [Hit, number]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h]) => h)
    : all.filter((h) => h.hint === 'do').slice(0, 12);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [q]);
  const go = (h: Hit | undefined) => { if (h) { nav.to(h.to); onClose(); } };
  return (
    <div className="command-veil" onMouseDown={onClose}>
      <div className="command" role="dialog" aria-label="Command" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input} className="text" value={q} placeholder="What do you want to do, or who? (knight, academy, tourney, a name…)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            else if (e.key === 'Enter') go(list[sel]);
          }}
        />
        <div className="command-list">
          {list.length === 0 ? <div className="muted" style={{ padding: 10 }}>Nothing by that name.</div> : null}
          {list.map((h, i) => (
            <button key={h.label + i} type="button" className="command-item" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
              <span>{h.label}</span><span className="muted">{h.hint === 'do' ? '›' : h.hint}</span>
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, padding: '6px 10px', borderTop: '1px solid var(--line)' }}>↑↓ to choose · Enter to go · Esc to close · open any time with / or Ctrl-K</div>
      </div>
    </div>
  );
}
