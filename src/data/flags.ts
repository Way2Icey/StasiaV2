import type { FlagVisibility } from '../sim/types';

// Status flags: what is currently true about someone (Traits and House Cultures doc).

export type FlagKind = 'condition' | 'legal' | 'political' | 'secret' | 'credential' | 'relation';

export interface FlagDef {
  id: string;
  label: string;
  kind: FlagKind;
  visibility: FlagVisibility;
  endsBy: string;
}

export const FLAGS: FlagDef[] = [
  { id: 'wounded', label: 'Wounded', kind: 'condition', visibility: 'all', endsBy: 'Heals over time; the Physician speeds it' },
  { id: 'ill', label: 'Ill', kind: 'condition', visibility: 'all', endsBy: 'Recovers, or dies' },
  { id: 'grieving', label: 'Grieving', kind: 'condition', visibility: 'all', endsBy: 'Fades over Orbits' },
  { id: 'godglass', label: 'Godglass user', kind: 'condition', visibility: 'secret', endsBy: 'Treatment, or burnout' },
  { id: 'driftMarked', label: 'Drift-marked', kind: 'condition', visibility: 'all', endsBy: 'Rarely ends' },
  { id: 'captive', label: 'Captive', kind: 'condition', visibility: 'secret', endsBy: 'Ransom, rescue, release or execution' },
  { id: 'missing', label: 'Missing', kind: 'condition', visibility: 'all', endsBy: 'Found, or declared dead' },
  { id: 'exile', label: 'Exile', kind: 'legal', visibility: 'all', endsBy: 'Pardon or return by force' },
  { id: 'pardoned', label: 'Pardoned', kind: 'legal', visibility: 'all', endsBy: 'Permanent; owes the pardoner' },
  { id: 'oathbreaker', label: 'Oathbreaker', kind: 'legal', visibility: 'all', endsBy: 'Fades only after years of kept promises' },
  { id: 'usurper', label: 'Usurper', kind: 'legal', visibility: 'all', endsBy: 'Recognised by the Numarade, or overthrown' },
  { id: 'wanted', label: 'Wanted', kind: 'legal', visibility: 'secret', endsBy: 'Captured, pardoned or bought off' },
  { id: 'underWatch', label: 'Under watch', kind: 'legal', visibility: 'secret', endsBy: 'Cleared or charged' },
  { id: 'ward', label: 'Ward', kind: 'political', visibility: 'all', endsBy: 'Returned home, or adopted' },
  { id: 'betrothed', label: 'Betrothed', kind: 'political', visibility: 'all', endsBy: 'Married, or the betrothal is broken' },
  { id: 'trueNameKnown', label: 'True Name Known', kind: 'secret', visibility: 'secret', endsBy: 'Permanent' },
  { id: 'knownTraitor', label: 'Known Traitor', kind: 'secret', visibility: 'secret', endsBy: 'Permanent once public' },
  { id: 'bastardBorn', label: 'Bastard-born', kind: 'secret', visibility: 'secret', endsBy: 'Permanent once public' },
  { id: 'logician', label: 'Logician', kind: 'credential', visibility: 'all', endsBy: 'Permanent' },
  { id: 'knighted', label: 'Knighted', kind: 'credential', visibility: 'all', endsBy: 'Stripped for disgrace' },
  { id: 'caigeBonded', label: 'Caige-bonded', kind: 'credential', visibility: 'all', endsBy: 'Caige stripped or lost' },
  { id: 'debtor', label: 'Debtor', kind: 'credential', visibility: 'secret', endsBy: 'Debt repaid' },
  { id: 'twin', label: 'Twin', kind: 'relation', visibility: 'all', endsBy: 'Permanent' },
  { id: 'callsign', label: 'Callsign', kind: 'relation', visibility: 'all', endsBy: 'Changes with new deeds' },
];

export const FLAGS_BY_ID: Record<string, FlagDef> = Object.fromEntries(FLAGS.map((f) => [f.id, f]));
