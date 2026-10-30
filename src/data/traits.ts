import type { HiddenStatId, StatId, TraitCategory } from '../sim/types';

// The traits picked for the vertical slice (Traits and House Cultures doc).
// Earned traits with a [bracket] in their label take a `detail` naming the
// place or deed, e.g. "Victor of the Kessar Pits".

export interface TraitDef {
  id: string;
  /** Label; `{detail}` is replaced with the instance's detail. */
  label: string;
  category: TraitCategory;
  description: string;
  statMods?: Partial<Record<StatId, number>>;
  hiddenMods?: Partial<Record<HiddenStatId, number>>;
  /** Traits that cannot be held together with this one. */
  opposes?: string[];
  /** Extra years of life (Long-lived). */
  lifespanBonus?: number;
}

export const TRAITS: TraitDef[] = [
  // ------------------------------------------------------------ born
  { id: 'gifted', label: 'Gifted', category: 'born', description: 'Learns everything faster; higher potential.',
    statMods: { intellect: 2, perception: 1 }, hiddenMods: { potential: 3 } },
  { id: 'ironBlooded', label: 'Iron-blooded', category: 'born', description: 'Shrugs off wounds and poison.',
    statMods: { constitution: 3, painTolerance: 2 } },
  { id: 'giant', label: 'Giant', category: 'born', description: 'Big Strength, poor Stealth; intimidating.',
    statMods: { strength: 3, stealth: -3 }, opposes: ['nimble'] },
  { id: 'nimble', label: 'Nimble', category: 'born', description: 'Agility and Reflexes edge.',
    statMods: { agility: 2, reflexes: 2 }, opposes: ['giant'] },
  { id: 'hale', label: 'Hale', category: 'born', description: 'Rarely ill; longer active life.',
    statMods: { constitution: 2, endurance: 1 }, lifespanBonus: 5 },
  { id: 'striking', label: 'Striking', category: 'born', description: 'Remarkable looks; easier first impressions, unwanted attention.',
    statMods: { diplomacy: 1 } },
  { id: 'charismatic', label: 'Charismatic', category: 'born', description: 'People warm to them; Diplomacy and Leadership edge.',
    statMods: { diplomacy: 2, leadership: 2, eloquence: 1 }, opposes: ['awkward'] },
  { id: 'awkward', label: 'Awkward', category: 'born', description: 'Social options cost more.',
    statMods: { diplomacy: -2, eloquence: -2 }, opposes: ['charismatic', 'silverTongued'] },
  { id: 'cunning', label: 'Cunning', category: 'born', description: 'Intrigue and Deception edge.',
    statMods: { intrigue: 2, deception: 2 } },
  { id: 'hotBlooded', label: 'Hot-blooded', category: 'born', description: 'Quick to anger; bold in battle, rash in talks.',
    statMods: { valor: 2, composure: -2 }, hiddenMods: { temperament: -3 }, opposes: ['coldBlooded'] },
  { id: 'coldBlooded', label: 'Cold-blooded', category: 'born', description: 'Calm under pressure; hard to love.',
    statMods: { composure: 3, diplomacy: -1 }, hiddenMods: { temperament: 3 }, opposes: ['hotBlooded'] },
  { id: 'longLived', label: 'Long-lived', category: 'born', description: 'Ages slowly for their species.',
    lifespanBonus: 25 },

  // ------------------------------------------------------------ learned: training
  { id: 'duelistsCreed', label: "Duelist's Creed", category: 'learned', description: 'Trained in formal single combat; bound by duel etiquette.',
    statMods: { duelling: 3, composure: 1 } },
  { id: 'archivist', label: 'Archivist', category: 'learned', description: 'Trained in records; better Chronicle accuracy and forgery detection.',
    statMods: { intellect: 2, law: 2 } },
  { id: 'tactician', label: 'Tactician', category: 'learned', description: 'Schooled in war; extra battle options.',
    statMods: { tactics: 3, siegecraft: 1 } },
  { id: 'courtier', label: 'Courtier', category: 'learned', description: 'Knows court etiquette; avoids social blunders.',
    statMods: { diplomacy: 2, eloquence: 1 } },
  { id: 'linguist', label: 'Linguist', category: 'learned', description: 'Speaks many tongues; fewer misunderstandings abroad.',
    statMods: { negotiation: 2, diplomacy: 1 } },
  { id: 'healer', label: 'Healer', category: 'learned', description: 'Medical training; saves lives on missions.',
    statMods: { intellect: 1, perception: 1 } },
  { id: 'streetWise', label: 'Street-wise', category: 'learned', description: 'Raised in the lower sectors; black-market and underworld options.',
    statMods: { stealth: 2, insight: 1, intrigue: 1 } },

  // ------------------------------------------------------------ learned: temperament
  { id: 'honourBound', label: 'Honour-bound', category: 'learned', description: "Won't lie or break a vow; big Honor, fewer options.",
    statMods: { deception: -3 }, hiddenMods: { loyalty: 2 }, opposes: ['ruthless'] },
  { id: 'ruthless', label: 'Ruthless', category: 'learned', description: 'Unlocks cruel options; Dread up, Respect down.',
    opposes: ['merciful', 'honourBound'] },
  { id: 'merciful', label: 'Merciful', category: 'learned', description: 'Spares enemies; Respect up, risk of betrayal.',
    opposes: ['ruthless', 'wrathful'] },
  { id: 'ambitious', label: 'Ambitious', category: 'learned', description: 'Wants more power; works hard, might want your seat.',
    statMods: { determination: 2 }, hiddenMods: { ambition: 5 }, opposes: ['humble'] },
  { id: 'generous', label: 'Generous', category: 'learned', description: 'Gives freely; loved, poorer.',
    hiddenMods: { greed: -4 } },
  { id: 'proud', label: 'Proud', category: 'learned', description: "Insults cut deep; won't back down.",
    statMods: { determination: 1 }, opposes: ['humble'] },
  { id: 'humble', label: 'Humble', category: 'learned', description: 'Takes criticism well; easy to overlook.',
    opposes: ['proud', 'ambitious'] },
  { id: 'brave', label: 'Brave', category: 'learned', description: 'First into danger.',
    statMods: { valor: 2 }, hiddenMods: { nerve: 2 } },
  { id: 'wrathful', label: 'Wrathful', category: 'learned', description: 'Holds grudges hard; memories harden faster.',
    hiddenMods: { temperament: -3 }, opposes: ['merciful'] },
  { id: 'paranoid', label: 'Paranoid', category: 'learned', description: 'Hard to plot against; trusts no one, including you.',
    statMods: { insight: 2 }, opposes: ['trusting'] },
  { id: 'trusting', label: 'Trusting', category: 'learned', description: 'Easy to deceive; loyal once won.',
    statMods: { insight: -2 }, hiddenMods: { loyalty: 2 }, opposes: ['paranoid'] },
  { id: 'silverTongued', label: 'Silver-tongued', category: 'learned', description: 'Flatters and persuades.',
    statMods: { eloquence: 3 }, opposes: ['awkward'] },

  // ------------------------------------------------------------ earned
  { id: 'victorOf', label: 'Victor of {detail}', category: 'earned', description: 'Won a famous tournament or duel.' },
  { id: 'heroOf', label: 'Hero of {detail}', category: 'earned', description: 'Turned a battle; soldiers follow them.',
    statMods: { leadership: 1 } },
  { id: 'kingmaker', label: 'Kingmaker', category: 'earned', description: 'Decided a succession or election.' },
  { id: 'kinslayer', label: 'Kinslayer', category: 'earned', description: 'Killed family; Dread up, deep distrust.' },
  { id: 'butcherOf', label: 'Butcher of {detail}', category: 'earned', description: 'A massacre; feared and hated.' },
  { id: 'burnerOf', label: 'Burner of {detail}', category: 'earned', description: 'Ordered city bombardment.' },
  { id: 'breakerOf', label: 'Breaker of {detail}', category: 'earned', description: 'Destroyed a house.' },
  { id: 'battleScarred', label: 'Battle-scarred', category: 'earned', description: 'Visibly marked by war; respected by soldiers.' },
  { id: 'survivorOf', label: 'Survivor of {detail}', category: 'earned', description: 'Lived through a disaster; bonded to other survivors.' },
  { id: 'scarName', label: '{detail}', category: 'earned', description: 'A Torvann scar-name: earned scars that tell a story.' },
];

export const TRAITS_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function traitLabel(id: string, detail?: string): string {
  const def = TRAITS_BY_ID[id];
  if (!def) return id;
  return def.label.replace('{detail}', detail ?? '…');
}
