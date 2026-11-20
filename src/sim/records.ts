// The record log: one shape for everything that happens. New code writes
// full records with logRecord; older entries are classified on the way out.
import type { FeedEntry, RecordType, Severity, World } from './types';

export const TYPE_LABEL: Record<RecordType, string> = {
  decision: 'decision', mission: 'mission', port: 'port', seizure: 'seizure', raid: 'raid', fight: 'fight',
  death: 'death', birth: 'birth', intrigue: 'intrigue', captive: 'captive', council: 'council', politics: 'politics',
  discovery: 'discovery', economy: 'economy', world: 'world', time: 'time', condition: 'condition',
};

export const SEVERITY_LABEL = ['routine', 'notable', 'serious', 'grave'] as const;
export const SEVERITY_MARK = ['·', '!', '!!', '!!!'] as const;

/** Write a full record into the log. */
export function logRecord(world: World, r: Omit<FeedEntry, 'date' | 'id'> & { date?: FeedEntry['date'] }): FeedEntry {
  const entry: FeedEntry = { ...r, id: `rec${world.nextId++}`, date: r.date ?? world.date };
  if (!entry.characterIds && entry.who?.length) entry.characterIds = entry.who.map((w) => w.id);
  world.feed.push(entry);
  return entry;
}

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

/** Type and severity for any entry, including ones written before records had them. */
export function classify(world: World, e: FeedEntry): { type: RecordType; severity: Severity } {
  if (e.type && e.severity !== undefined) return { type: e.type, severity: e.severity };
  const t = e.text.toLowerCase();
  const P = world.playerHouseId;
  const ours = (e.characterIds ?? []).some((id) => world.characters[id]?.houseId === P);
  let type: RecordType = e.type ?? 'world';
  let severity: Severity = 1;
  switch (e.kind) {
    case 'time': type = 'time'; severity = 0; break;
    case 'death': type = 'death'; severity = ours ? 3 : 2; break;
    case 'birth': type = 'birth'; severity = ours ? 2 : 1; break;
    case 'flag': type = 'condition'; severity = has(t, 'travelling', 'grieving', 'counselled', 'at sea') ? 0 : 1; break;
    case 'mission':
      type = 'mission';
      severity = has(t, 'disaster', 'captured', 'killed', 'taken') ? 2 : has(t, 'returns', 'home') ? 1 : 0;
      break;
    case 'council':
      type = has(t, 'chose to', 'left to the council') ? 'decision' : 'council';
      severity = has(t, 'at the exchange to cover', 'improves in', 'navisium quota') ? 0 : 1;
      break;
    case 'intrigue':
      type = has(t, 'captive', 'held', 'seized', 'ransom', 'executed', 'released') ? 'captive' : 'intrigue';
      severity = has(t, 'executed', 'seized', 'captured') ? 2 : 1;
      break;
    case 'world':
      if (has(t, 'corsair', 'raid')) { type = 'raid'; severity = has(t, 'sacked', 'driven off') ? 3 : 2; }
      else if (has(t, 'customs', 'docked', 'port')) { type = 'port'; severity = 1; }
      else if (has(t, 'othes', 'quota', 'exchange', 'ledger', 'tax')) { type = 'economy'; severity = 1; }
      else if (has(t, 'oath', 'swore', 'commend', 'condemn', 'numarade')) { type = 'politics'; severity = 1; }
      else if (has(t, 'found', 'recruit', 'caige', 'lead')) { type = 'discovery'; severity = 1; }
      break;
  }
  return { type: e.type ?? type, severity: e.severity ?? severity };
}

/** Records about a person: named, or one of the people with a part. */
export function involves(e: FeedEntry, characterId: string): boolean {
  return !!(e.characterIds?.includes(characterId) || e.who?.some((w) => w.id === characterId));
}

const FEED_LIMIT = 1500;

/** Keep the log bounded: routine records go first, then the oldest. */
export function trimFeed(world: World): void {
  if (world.feed.length <= FEED_LIMIT) return;
  const keep = Math.floor(FEED_LIMIT * 0.85);
  let over = world.feed.length - keep;
  // Clock ticks go first, then other routine records, oldest first.
  const drop = new Set<FeedEntry>();
  for (const e of world.feed) { if (over <= 0) break; if (e.kind === 'time') { drop.add(e); over--; } }
  for (const e of world.feed) { if (over <= 0) break; if (!drop.has(e) && classify(world, e).severity === 0) { drop.add(e); over--; } }
  const out = world.feed.filter((e) => !drop.has(e));
  world.feed = out.length > FEED_LIMIT ? out.slice(-keep) : out;
}
