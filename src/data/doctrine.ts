// The War Room's vocabulary: what a group can be told to be, how a house fights a whole war, and the
// doctrines it has drilled. Thirteen roles for the ground and thirteen for the void; eight theatre-wide
// instructions; thirteen doctrine cards, of which a house carries four at most.

export type Domain = 'ground' | 'void';

export type GroundRole =
  | 'spearhead' | 'anvil' | 'hammer' | 'screen' | 'rearguard' | 'anchor' | 'raider'
  | 'infiltrator' | 'siege' | 'reserve' | 'bait' | 'pursuer' | 'lance';
export type VoidRole =
  | 'line' | 'guard' | 'strike' | 'fighters' | 'wing' | 'picket' | 'blockade'
  | 'laneRaider' | 'escort' | 'gunline' | 'decoy' | 'squadron' | 'shadow';
export type Role = GroundRole | VoidRole;
export type Duty = 'attack' | 'defend' | 'support';
export type Leash = 'tight' | 'normal' | 'free';

export interface RoleDef { label: string; duty: Duty; note: string; does: string; hidden?: boolean }

export const GROUND_ROLES: Record<GroundRole, RoleDef> = {
  spearhead: { label: 'Spearhead', duty: 'attack', note: 'Leads the assault.', does: '×1.15 attacking; blunted by an anvil.' },
  anvil: { label: 'Anvil', duty: 'defend', note: 'Holds the line and takes the blow.', does: '×1.2 defending; pins what hits it so the hammer can fall.' },
  hammer: { label: 'Hammer', duty: 'attack', note: 'Strikes an enemy already held by a friend.', does: '×1.35 joining a fight a friend is in; ×1.15 more unseen; can encircle.', hidden: true },
  screen: { label: 'Screen', duty: 'support', note: 'Hides what stands behind it and sees what comes.', does: 'Our groups at its place and next to it are harder to see; it sees one place further.' },
  rearguard: { label: 'Rearguard', duty: 'defend', note: 'Covers a retreat.', does: 'Friends falling back through it lose 40% less; ×1.15 holding.' },
  anchor: { label: 'Anchor', duty: 'defend', note: 'Holds a world or a station and never leaves it.', does: '×1.1 defending, and it stiffens the garrison.' },
  raider: { label: 'Raider', duty: 'attack', note: 'Burns depots and convoys behind their lines.', does: 'Cuts their supply where it stands; slips past anything twice its size.', hidden: true },
  infiltrator: { label: 'Infiltrator', duty: 'support', note: 'Goes in quietly ahead of everyone.', does: 'Sees everything where it stands; wears their walls down.', hidden: true },
  siege: { label: 'Siege train', duty: 'attack', note: 'Guns and sappers for walls.', does: 'Takes back most of what walls give the defender.' },
  reserve: { label: 'Reserve', duty: 'support', note: 'Waits to be committed.', does: 'Joins a fight next to it, fresh: ×1.1. Tight leash: only when you call it.' },
  bait: { label: 'Bait', duty: 'support', note: 'Shows itself, then falls back where you want them.', does: 'Draws the rash after it; whoever follows into an anvil is caught: ×1.3.' },
  pursuer: { label: 'Pursuer', duty: 'attack', note: 'Runs down what breaks.', does: 'Half again the losses on a beaten enemy; follows them.' },
  lance: { label: 'Knights\' lance', duty: 'attack', note: 'The knights lead from the front.', does: 'Knights count double; ×1.1; they are the ones at risk.' },
};

export const VOID_ROLES: Record<VoidRole, RoleDef> = {
  line: { label: 'Line of battle', duty: 'attack', note: 'The main body of the fleet.', does: '×1.1 in a fleet fight.' },
  guard: { label: 'Flagship guard', duty: 'defend', note: 'Keeps the great ships alive.', does: 'Great ships take half the harm; ×1.05 holding.' },
  strike: { label: 'Lance', duty: 'attack', note: 'Goes for their great ships.', does: '×1.15 attacking; their great ships take more harm.' },
  fighters: { label: 'Fighter screen', duty: 'support', note: 'Fighters thrown out around the fleet.', does: 'Blunts their strike wings and lances; sees one place further.' },
  wing: { label: 'Strike wing', duty: 'attack', note: 'Gunships and fighters going fast.', does: '×1.2; ×1 against a fighter screen; murder on transports.' },
  picket: { label: 'Picket', duty: 'support', note: 'Watches a lane.', does: 'Sees two places out; nothing passes it unseen.' },
  blockade: { label: 'Blockade', duty: 'defend', note: 'Sits on their orbit or their lane.', does: 'Their trade and their supply through it stop; ×1.05 holding.' },
  laneRaider: { label: 'Lane raider', duty: 'attack', note: 'Takes their convoys.', does: 'Drains their treasury and their supply; avoids their line.', hidden: true },
  escort: { label: 'Escort', duty: 'support', note: 'Rides with the transports.', does: 'Troops with it cannot be caught in their ships.' },
  gunline: { label: 'Gunline', duty: 'support', note: 'Fires on the ground from orbit.', does: '×1.35 to our troops on the world below, if we hold the orbit.' },
  decoy: { label: 'Decoy', duty: 'support', note: 'Looks like the whole fleet.', does: 'They see it three times its size.' },
  squadron: { label: 'Reserve squadron', duty: 'support', note: 'Held back to be committed.', does: 'Joins a fleet fight next to it, fresh: ×1.1.' },
  shadow: { label: 'Shadow', duty: 'support', note: 'Runs dark and listens.', does: 'Sees everything where it stands and next to it; hard to see.', hidden: true },
};

export const ROLE_DEF: Record<Role, RoleDef> = { ...GROUND_ROLES, ...VOID_ROLES };
export const rolesFor = (d: Domain): Role[] => (d === 'ground' ? Object.keys(GROUND_ROLES) : Object.keys(VOID_ROLES)) as Role[];
export const DUTY_LABEL: Record<Duty, string> = { attack: 'Attack', defend: 'Defend', support: 'Support' };
export const LEASH_LABEL: Record<Leash, string> = { tight: 'Tight', normal: 'Normal', free: 'Free' };
export const LEASH_NOTE: Record<Leash, string> = {
  tight: 'Does exactly what it is told and nothing else.',
  normal: 'Follows orders; falls back and commits reserves by its own judgement.',
  free: 'Its commander acts on what they see: pursues, reinforces, takes chances. Good commanders shine; poor ones blunder.',
};

// ---------------------------------------------------------------- the whole war

export type Opp = 'none' | 'pin' | 'isolate' | 'avoid' | 'bait' | 'hunt';
export const OPP_LABEL: Record<Opp, string> = { none: '—', pin: 'Pin it', isolate: 'Isolate it', avoid: 'Avoid it', bait: 'Bait it', hunt: 'Hunt it' };
export const OPP_NOTE: Record<Opp, string> = {
  none: 'No special orders.',
  pin: 'Whoever meets it holds it in place: it cannot break away, and a hammer can find it.',
  isolate: 'Raiders go for its supply first.',
  avoid: 'Our groups do not seek it out.',
  bait: 'Our bait shows itself to it.',
  hunt: 'Our attacking groups go after it wherever it is seen.',
};

export type LineAt = 'home' | 'approaches' | 'border' | 'forward';
export type SupplyAt = 'balanced' | 'void' | 'ground';
export type Quarter = 'honourable' | 'ransom' | 'none';
export type KnightsAt = 'lead' | 'reserve' | 'hunt';

export interface Instructions {
  /** 0 cautious .. 4 relentless: how fast groups move, and how tired they get. */
  tempo: number;
  /** 0 narrow .. 4 wide: concentrate, or press everywhere. */
  width: number;
  /** 0 careful .. 4 reckless. */
  risk: number;
  /** 0 none .. 4 to the last. */
  pursuit: number;
  line: LineAt;
  supply: SupplyAt;
  quarter: Quarter;
  knights: KnightsAt;
}

export const DEFAULT_INSTRUCTIONS: Instructions = { tempo: 2, width: 2, risk: 2, pursuit: 2, line: 'approaches', supply: 'balanced', quarter: 'honourable', knights: 'lead' };
export const SLIDER_WORDS: Record<'tempo' | 'width' | 'risk' | 'pursuit', string[]> = {
  tempo: ['cautious', 'measured', 'steady', 'quick', 'relentless'],
  width: ['narrow', 'close', 'even', 'broad', 'wide'],
  risk: ['careful', 'prudent', 'even', 'bold', 'reckless'],
  pursuit: ['none', 'light', 'firm', 'hard', 'to the last'],
};
export const SLIDER_NOTE: Record<'tempo' | 'width' | 'risk' | 'pursuit', string> = {
  tempo: 'Faster marches and more tired troops.',
  width: 'Narrow keeps our strength together: ×1.08 where two groups fight side by side. Wide presses everywhere: more ground held, thinner fights.',
  risk: 'Bold fights harder and bleeds more; careful the reverse.',
  pursuit: 'How hard we run down what breaks: their losses up, our tiredness up.',
};
export const LINE_LABEL: Record<LineAt, string> = { home: 'Our worlds', approaches: 'Our approaches', border: 'The border', forward: 'Their approaches' };
export const SUPPLY_LABEL: Record<SupplyAt, string> = { balanced: 'Balanced', void: 'Void first', ground: 'Ground first' };
export const QUARTER_LABEL: Record<Quarter, string> = { honourable: 'Honourable', ransom: 'For ransom', none: 'No quarter' };
export const QUARTER_NOTE: Record<Quarter, string> = {
  honourable: 'Prisoners are kept and returned. The houses notice.',
  ransom: 'Their officers are held for othes.',
  none: 'Their losses up a fifth; our honour down, and theirs will not forget it.',
};
export const KNIGHTS_LABEL: Record<KnightsAt, string> = { lead: 'Lead from the front', reserve: 'Held back', hunt: 'Hunt their knights' };

// ---------------------------------------------------------------- doctrine

export type DoctrineId =
  | 'supply' | 'elastic' | 'silent' | 'shock' | 'attrition' | 'concentration' | 'voidFirst'
  | 'fortress' | 'knightHunt' | 'deepRaid' | 'drop' | 'discipline' | 'whispers';

export interface DoctrineDef { label: string; note: string }
export const DOCTRINES: Record<DoctrineId, DoctrineDef> = {
  supply: { label: 'Strike the supply', note: 'Raiders and lane raiders do twice the harm.' },
  elastic: { label: 'Elastic defence', note: 'Beaten defenders give ground instead of dying on it: 30% fewer losses; whoever follows is ×0.9.' },
  silent: { label: 'Silent Wire', note: 'Every group is one step harder to see; ×0.97 for the quiet.' },
  shock: { label: 'Shock', note: 'A group\'s first fight of the war is ×1.2; every one after, ×0.97.' },
  attrition: { label: 'Attrition', note: 'We lose 15% fewer; we hit a little softer.' },
  concentration: { label: 'Concentration', note: 'Two or more of our groups in one fight: ×1.12.' },
  voidFirst: { label: 'Void first', note: 'Ships ×1.15; troops ×0.95 until we hold the orbit we want.' },
  fortress: { label: 'Fortress', note: 'Behind walls: ×1.15 more.' },
  knightHunt: { label: 'Hunt their knights', note: 'Their knights are in twice the danger, and ours seek them.' },
  deepRaid: { label: 'Deep raid', note: 'Raiders and infiltrators move a third faster and live off the land.' },
  drop: { label: 'Orbital drop', note: 'Landing on a world whose orbit we hold: ×1.2.' },
  discipline: { label: 'Iron discipline', note: 'Morale never falls below 40; fall-backs happen in order.' },
  whispers: { label: 'War of whispers', note: 'The Spymaster\'s people everywhere: we see one step better, and their plan unsettles.' },
};
export const MAX_DOCTRINES = 4;

/** How each house is known to fight: its doctrine and what it gives away. Canon where the canon says. */
export type Style = 'assault' | 'void' | 'knights' | 'raid' | 'attrition' | 'balanced' | 'shock';
export interface HouseDoctrine { style: Style; cards: DoctrineId[]; tell: string }
export const HOUSE_DOCTRINE: Record<string, HouseDoctrine> = {
  torvann: { style: 'assault', cards: ['fortress', 'discipline', 'shock'], tell: 'Torvann marches on the strongest wall and goes through it. They do not feint, they do not bait, and they rarely refuse a fight that is offered.' },
  endama: { style: 'assault', cards: ['drop', 'discipline', 'shock'], tell: 'Endama goes for the planet: a fast fleet, then everything lands at once.' },
  varngotha: { style: 'shock', cards: ['shock', 'discipline', 'concentration'], tell: 'Few, and every one a titan: they hit once, very hard, and do not like a long war.' },
  theaszar: { style: 'knights', cards: ['knightHunt', 'shock', 'concentration'], tell: 'TheaSzar leads with its knights and wants the duel.' },
  myr: { style: 'void', cards: ['voidFirst', 'drop', 'concentration'], tell: 'Myr wins the void first. Its troops wait until the sky is theirs.' },
  doven: { style: 'attrition', cards: ['attrition', 'supply', 'fortress'], tell: 'Doven outlasts. Their convoys never stop, and they make yours stop.' },
  lumen: { style: 'balanced', cards: ['concentration', 'discipline', 'voidFirst', 'whispers'], tell: 'Lumen does everything properly. No tell worth having.' },
  mull: { style: 'balanced', cards: ['fortress', 'attrition'], tell: 'An ordinary war, fought in an ordinary way.' },
  shaaliin: { style: 'raid', cards: ['whispers', 'silent', 'supply', 'deepRaid'], tell: 'Shaaliin never shows you its army. It shows you something else.' },
  serath: { style: 'raid', cards: ['deepRaid', 'silent', 'shock'], tell: 'Scouts and strike teams: small blows, everywhere.' },
  koren: { style: 'void', cards: ['voidFirst', 'fortress'], tell: 'Koren\'s yards build faster than you can sink them.' },
  murnath: { style: 'attrition', cards: ['fortress', 'attrition', 'elastic'], tell: 'They built your fortresses. They built theirs better.' },
  alerion: { style: 'raid', cards: ['whispers', 'silent', 'supply'], tell: 'Alerion knows where you are before you do.' },
  azure: { style: 'balanced', cards: ['whispers', 'elastic'], tell: 'They would rather talk, and they fight as if they mean to.' },
};
