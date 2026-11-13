// Hover definitions: what each word on screen means and why it matters.
// Kept short: one line on what it is, one on what it does in play.

export type GlossaryGroup = 'Time' | 'Houses' | 'Holdings' | 'Economy' | 'People' | 'Attributes' | 'Hidden' | 'Council' | 'Missions' | 'Intrigue';

export interface GlossaryEntry {
  term: string;
  group: GlossaryGroup;
  text: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ---------------------------------------------------------------- time
  cycle: { term: 'Cycle', group: 'Time', text: 'The smallest unit of LPS time, about a couple of days. Each Continue moves two cycles.' },
  phase: { term: 'Phase', group: 'Time', text: '16 cycles. The economy settles at the start of each Phase: output, taxes, food and stipends.' },
  orbit: { term: 'Orbit', group: 'Time', text: '80 cycles, five Phases. Oaths last an Orbit, and the Numarade grants Navisium once per Orbit.' },
  year: { term: 'Standard Year', group: 'Time', text: 'Ten Orbits (800 cycles). Ages and lifespans are counted in years.' },
  stopOnEvents: { term: 'Stop when something needs me', group: 'Time', text: 'Long stretches of time stop early when a mission comes home, a petition or ransom demand arrives, someone is caught, a lead turns up, the oath ends, or someone of the house dies.' },
  continue: { term: 'Continue', group: 'Time', text: 'Advances the world two cycles. The arrow beside it skips further: to the next Phase or Orbit, a year, five years, or until something happens.' },

  // ---------------------------------------------------------------- houses
  house: { term: 'House', group: 'Houses', text: 'A dynasty of the Houses of Archon: a ruling family, the noble families sworn to it, its worlds and its people.' },
  greatHouse: { term: 'Great House', group: 'Houses', text: 'One of the houses at the top of the Archon order. Bigger Navisium quotas and more weight in the Numarade.' },
  minorHouse: { term: 'Minor House', group: 'Houses', text: 'A house below the great ones. Smaller quotas and less say; climbing is the game.' },
  highroy: { term: 'Highroy', group: 'Houses', text: 'Head of a house. Rules, swears the oath, and never goes out on missions personally.' },
  family: { term: 'Family', group: 'Houses', text: 'A bloodline inside a house. Noble families hold sectors and oversee quarters; the ruling family holds the seat.' },
  numarade: { term: 'Numarade', group: 'Houses', text: 'The governing assembly of the Houses of Archon. It rations Navisium, levies tariffs, and can censure or sanction a house.' },
  standing: { term: 'Standing', group: 'Houses', text: "A house's honour, respect and dread, each 0–100. They decide prices, quotas and how others treat you." },
  honour: { term: 'Honour', group: 'Houses', text: 'Keeping your word: oaths kept, debts paid. Honour sets what your othes are worth at the Exchange.' },
  respect: { term: 'Respect', group: 'Houses', text: 'Standing at court and in the Numarade. More respect, a larger Navisium quota.' },
  dread: { term: 'Dread', group: 'Houses', text: 'How much the other houses fear you. Raised by executions, patrols and victories in the pits.' },
  regard: { term: 'Regard', group: 'Houses', text: 'How one house feels about another, from -100 (Hostile) to +100 (Close). Envoys and courtesy warm it; spies and executions sour it.' },

  // ---------------------------------------------------------------- holdings
  holdings: { term: 'Holdings', group: 'Holdings', text: 'Everything a house owns: its worlds, the sectors on them and the quarters in those sectors.' },
  world: { term: 'World', group: 'Holdings', text: 'A planet held by a house. It has a limit on how many sectors can be settled.' },
  sector: { term: 'Sector', group: 'Holdings', text: 'A region of a world, like a city or a district. It has people, a port, room to build, and unrest. A family of your house holds it.' },
  quarter: { term: 'Quarter', group: 'Holdings', text: 'A place inside a sector: a starport, foundry, farm or garrison. Each produces or costs something every Phase and is run by an overseer.' },
  overseer: { term: 'Overseer', group: 'Holdings', text: "The person running a quarter. Their stewardship raises or lowers its output; a greedy one may skim the takings." },
  designation: { term: 'Designation', group: 'Holdings', text: 'What a sector is for (Farmland, Industrial, Port city…). It decides which quarters fit there.' },
  port: { term: 'Port', group: 'Holdings', text: "A sector's landing facilities: none, landing field, spaceport or starport. Bigger ports mean more trade and a juicier target in war." },
  room: { term: 'Room', group: 'Holdings', text: 'How much building space a sector has, used and total. Developing a sector uses room.' },
  population: { term: 'Population', group: 'Holdings', text: 'People living in a sector. They pay taxes and eat provisions.' },
  unrest: { term: 'Unrest', group: 'Holdings', text: "How restless a sector's people are, 0–100. It cuts output and taxes, and rises with high taxes and food shortages." },
  heldBy: { term: 'Held by', group: 'Holdings', text: 'The family that controls the sector for its house and appoints most of its overseers.' },
  peoples: { term: 'Peoples', group: 'Holdings', text: 'The species mix of the sector.' },

  // ---------------------------------------------------------------- economy
  othes: { term: 'Othes', group: 'Economy', text: "The currency, and a promise. A house's honour sets what its othes are worth." },
  navisium: { term: 'Navisium', group: 'Economy', text: 'The rare resource the Numarade rations. Caiges, shard weapons; refined into fuel and components.' },
  metals: { term: 'Metals', group: 'Economy', text: 'From mines and foundries. Ships, armour, construction.' },
  provisions: { term: 'Provisions', group: 'Economy', text: 'Food and everyday goods. Every 1,800 people eat one a Phase; running out raises unrest everywhere.' },
  fuel: { term: 'Fuel', group: 'Economy', text: 'Refined from Navisium and energy. Jumps, shields and fleets will burn it.' },
  components: { term: 'Components', group: 'Economy', text: 'Made from Navisium and metals. Weapons, machines, Caige work.' },
  computing: { term: 'Computing', group: 'Economy', text: 'Capacity per Orbit from data halls and arrays. It will be assigned to research, intel and cyber operations.' },
  ledger: { term: 'Ledger', group: 'Economy', text: 'Every regular source and use of a resource, with where it is and who runs it, so a shortfall points straight to its cause.' },
  taxes: { term: 'Taxes', group: 'Economy', text: 'Othes from every person in your sectors each Phase. Higher rates bring more coin and more unrest.' },
  quota: { term: 'Navisium quota', group: 'Economy', text: "The Numarade's grant of Navisium each Orbit. Its size follows your respect." },
  exchange: { term: 'Imperial Exchange', group: 'Economy', text: 'The market every house trades on. Prices move with what the houses buy and sell, then drift back.' },
  credit: { term: 'Credit', group: 'Economy', text: 'Your honour as a buyer. Low honour adds a markup to everything you buy; high honour earns a discount.' },
  skim: { term: 'Unaccounted for', group: 'Economy', text: 'Takings that never reached the treasury. Someone is skimming; an audit may name them.' },
  stipend: { term: 'Stipends', group: 'Economy', text: 'What the house pays each council member per Phase.' },
  debt: { term: 'Debt', group: 'Economy', text: 'Othes below zero. Each Phase in debt costs a point of honour.' },

  // ---------------------------------------------------------------- people
  knowledge: { term: 'Knowledge', group: 'People', text: 'How well your house knows a person, 0–100. Low knowledge shows abilities as ranges and hides traits and secrets.' },
  range: { term: 'Ranges', group: 'People', text: 'When your house is unsure, a number shows as a range like 9–14. The truth is always inside it. Investigate to narrow it.' },
  tier: { term: 'Named people', group: 'People', text: 'Full: someone who matters, tracked in detail. Minor: a named face with a lighter record. Everyone else is the crowd.' },
  traits: { term: 'Traits', group: 'People', text: 'Who someone is. Born (innate), learned (upbringing and training) or earned (a reputation from deeds). Earned traits are public; others need knowledge.' },
  status: { term: 'Status', group: 'People', text: 'Temporary or legal states: wounded, exiled, captive, knighted. Secret ones are visible only to houses that know them.' },
  resonance: { term: 'Resonance', group: 'People', text: 'Raw power measured in degrees (°S), in five bands from Frostpoint to Whitebreak. Caige-bonded people show their band openly.' },
  caige: { term: 'Caige', group: 'People', text: 'A bonded weapon or device that channels resonance. Bonding one to someone is a statement of trust.' },
  mind: { term: 'Mind', group: 'People', text: 'Command, court and craft: how someone thinks, persuades and plans.' },
  body: { term: 'Body', group: 'People', text: 'Physical ability: fighting, endurance, speed, stealth.' },
  spirit: { term: 'Spirit', group: 'People', text: 'Inner strength: will, nerve, leadership, and the bond with a Caige.' },

  // ---------------------------------------------------------------- attributes
  'stat:tactics': { term: 'Tactics', group: 'Attributes', text: 'Reading a fight and choosing the right move. Drives battle plans and drilling the host.' },
  'stat:logistics': { term: 'Logistics', group: 'Attributes', text: 'Moving people and supplies. Helps develop sectors and keep armies fed.' },
  'stat:fleetCommand': { term: 'Fleet Command', group: 'Attributes', text: 'Commanding ships in space.' },
  'stat:siegecraft': { term: 'Siegecraft', group: 'Attributes', text: 'Taking and holding fortified places.' },
  'stat:diplomacy': { term: 'Diplomacy', group: 'Attributes', text: 'Building trust between houses. The heart of envoy work.' },
  'stat:negotiation': { term: 'Negotiation', group: 'Attributes', text: 'Getting a good deal: treaties, trade, ransoms.' },
  'stat:eloquence': { term: 'Eloquence', group: 'Attributes', text: 'Speaking well before a crowd or the Numarade.' },
  'stat:intrigue': { term: 'Intrigue', group: 'Attributes', text: 'Working in the shadows: plots, informants, investigations.' },
  'stat:deception': { term: 'Deception', group: 'Attributes', text: 'Lying convincingly. Helps agents avoid being noticed and embezzlers avoid audits.' },
  'stat:insight': { term: 'Insight', group: 'Attributes', text: 'Reading people and seeing through lies. Spymasters need it to catch agents.' },
  'stat:stewardship': { term: 'Stewardship', group: 'Attributes', text: 'Running things well. An overseer with high stewardship gets more out of a quarter.' },
  'stat:law': { term: 'Law', group: 'Attributes', text: 'Knowing and using the law and custom of the Houses of Archon.' },
  'stat:intellect': { term: 'Intellect', group: 'Attributes', text: 'Learning, medicine, research and records.' },
  'stat:perception': { term: 'Perception', group: 'Attributes', text: 'Noticing things: a watcher in the crowd, a detail in a report.' },
  'stat:strength': { term: 'Strength', group: 'Attributes', text: 'Raw physical power.' },
  'stat:endurance': { term: 'Endurance', group: 'Attributes', text: 'Lasting through long marches and long fights.' },
  'stat:agility': { term: 'Agility', group: 'Attributes', text: 'Speed and balance. Helps a caught agent slip away.' },
  'stat:constitution': { term: 'Constitution', group: 'Attributes', text: 'Health and resistance to sickness and poison.' },
  'stat:duelling': { term: 'Duelling', group: 'Attributes', text: 'Single combat with a blade or Caige. What wins in the pits.' },
  'stat:marksmanship': { term: 'Marksmanship', group: 'Attributes', text: 'Shooting accurately.' },
  'stat:reflexes': { term: 'Reflexes', group: 'Attributes', text: 'Reacting fast. Helps escape capture.' },
  'stat:stealth': { term: 'Stealth', group: 'Attributes', text: 'Moving unseen. Agents and scouts live on it.' },
  'stat:painTolerance': { term: 'Pain Tolerance', group: 'Attributes', text: 'Fighting on through injury, and holding out under questioning.' },
  'stat:willpower': { term: 'Willpower', group: 'Attributes', text: 'Inner resolve. Resists interrogation and pressure.' },
  'stat:composure': { term: 'Composure', group: 'Attributes', text: 'Staying calm when it matters.' },
  'stat:determination': { term: 'Determination', group: 'Attributes', text: 'Seeing a hard thing through.' },
  'stat:valor': { term: 'Valor', group: 'Attributes', text: 'Courage under fire.' },
  'stat:leadership': { term: 'Leadership', group: 'Attributes', text: 'Making others follow. Matters for commanders and the Grand Master.' },
  'stat:discipline': { term: 'Discipline', group: 'Attributes', text: 'Order and drill, in oneself and in troops.' },
  'stat:caigeSync': { term: 'Caige Sync', group: 'Attributes', text: 'How well someone bonds with a Caige.' },
  'stat:resonanceControl': { term: 'Resonance Control', group: 'Attributes', text: 'Mastery of their own resonance, so power does not run away with them.' },

  // ---------------------------------------------------------------- hidden
  hidden: { term: 'Read of them', group: 'Hidden', text: "Hidden qualities your people can only estimate once they know someone well (knowledge 70+)." },
  'stat:loyalty': { term: 'Loyalty', group: 'Hidden', text: 'How faithful they are to their house. Low loyalty plus high greed means skimming, or worse.' },
  'stat:drift': { term: 'Drift', group: 'Hidden', text: 'How far their resonance pulls them from themselves. Dangerous when high.' },
  'stat:ambition': { term: 'Ambition', group: 'Hidden', text: 'How much they want more than they have.' },
  'stat:greed': { term: 'Greed', group: 'Hidden', text: 'Love of wealth. Greedy overseers skim.' },
  'stat:consistency': { term: 'Consistency', group: 'Hidden', text: 'How reliably they perform at their usual level.' },
  'stat:nerve': { term: 'Nerve', group: 'Hidden', text: 'Holding steady in a crisis.' },
  'stat:temperament': { term: 'Temperament', group: 'Hidden', text: 'How even their moods are.' },
  'stat:discretion': { term: 'Discretion', group: 'Hidden', text: 'Keeping secrets. Makes them harder to investigate.' },
  'stat:potential': { term: 'Potential', group: 'Hidden', text: 'How far they can still grow with training.' },

  // ---------------------------------------------------------------- council
  council: { term: 'Council', group: 'Council', text: "The Highroy's advisers, one per seat. Each holds a standing task that runs every turn." },
  task: { term: 'Standing task', group: 'Council', text: "What a council seat works on every turn. Results land when progress fills; better stats, faster results." },
  fit: { term: 'Fit', group: 'Council', text: "How well someone's stats suit a job: Poor, Fair, Good or Excellent." },
  oath: { term: 'Oath', group: 'Council', text: "The Highroy's one vow at a time, lasting an Orbit. Tasks that serve it work 25% harder. Keep it for honour; break it and lose some." },
  petition: { term: 'Petition', group: 'Council', text: 'A councillor asking to run a mission. Review opens the planner; dismissing one quietly costs a little of their loyalty.' },
  'seat:grandMaster': { term: 'Grand Master', group: 'Council', text: "Commands the house's knights and host." },
  'seat:envoy': { term: 'Envoy', group: 'Council', text: 'Speaks for the house to other houses and in the Numarade.' },
  'seat:spymaster': { term: 'Spymaster', group: 'Council', text: "Runs the house's informants. Sharper spymasters narrow every range and catch more agents." },
  'seat:steward': { term: 'Steward', group: 'Council', text: "Keeps the books and the peace in the house's sectors. Covers shortfalls at the Exchange." },
  'seat:physician': { term: 'Physician', group: 'Council', text: 'Tends the family and, if asked, the commons.' },
  'seat:elder': { term: 'Elder', group: 'Council', text: "Keeper of the house's records and traditions; teaches the young." },
  'seat:champion': { term: 'Champion', group: 'Council', text: "The house's best fighter. Trains knights, fights in the pits, and stands in trial by combat." },
  'seat:highroy': { term: 'Highroy', group: 'Council', text: 'Head of the house. Swears the oath; takes no task.' },

  // ---------------------------------------------------------------- missions
  mission: { term: 'Mission', group: 'Missions', text: 'Sending someone out: travel, work, travel back. The report arrives with them.' },
  investigate: { term: 'Investigate', group: 'Missions', text: 'Look into one person: their abilities, character and secrets.' },
  scout: { term: 'Scout', group: 'Missions', text: 'Survey a world: who lives there, who holds it, where it is weak.' },
  envoy: { term: 'Envoy', group: 'Missions', text: "Visit another house's court openly to warm their regard and meet their council." },
  approach: { term: 'Approach', group: 'Missions', text: 'Careful takes longer but is rarely noticed. Quick is back sooner but far riskier, and costs half again as much.' },
  noticed: { term: 'Noticed', group: 'Missions', text: 'The target house spotted your agent. It caps the result, tells them who you sent, and can end in capture.' },
  confidence: { term: 'Our estimate', group: 'Missions', text: 'How much to trust the forecast. It uses what your house believes about the target, which may be wrong.' },

  // ---------------------------------------------------------------- intrigue
  mood: { term: 'Mood', group: 'People', text: 'How someone feels about their house, 0–100: Resentful, Restless, Steady, Content, Eager. Good missions, rest, kept oaths and trust lift it; failures, being overworked, debt and broken oaths sour it. Below 25 they refuse to go out.' },
  fieldSlots: { term: 'Field slots', group: 'Missions', text: 'How many missions the house can have out at once, 1–6, set by the average mood of the council and knights. Anyone out does no duties at home.' },
  lead: { term: 'Leads and finds', group: 'Missions', text: 'What missions turn up: talented people to bring in, rumours of Caiges, secrets and sites worth working. Leads go cold after an Orbit.' },
  materialize: { term: 'Materialized', group: 'People', text: 'A nobody who became a somebody: someone a mission found, now a full named person with a record of their own.' },
  armoury: { term: 'Caige armoury', group: 'People', text: 'Caiges the house holds. Bonding one to someone raises their Caige Sync and their mood: a statement of trust.' },
  boon: { term: 'Deal or find', group: 'Economy', text: 'Temporary income from a trade deal or a site found on a mission. It runs for a set number of Orbits.' },
  annals: { term: 'Annals', group: 'Houses', text: "A house's record of its own doings: births, people taken in, Caiges found. Public things everyone hears; the rest we learn only by scouting, investigating or visiting them." },
  court: { term: 'The court at home', group: 'Houses', text: 'Nobles who stay home help the house, by who they are to the Highroy: the consort speeds the council and wins respect, the heir steadies moods, family heads calm their sectors, and other nobles add to income. Send them out and it is lost.' },
  companions: { term: 'Companions', group: 'Missions', text: 'Up to two people who go with the leader. Each adds a quarter of their skill, but a bigger party is easier to spot, and everyone in it is away from home.' },
  order: { term: 'Ordered to go', group: 'Missions', text: 'The Highroy can make someone go who refuses. They go, but their mood drops by 10, their loyalty slips, and they work grudgingly. The wounded and ill cannot be ordered.' },
  homeDuty: { term: 'Duties at home', group: 'Missions', text: 'Council members away do no task work. With more than half the knights away, the capital grows restless each Phase.' },
  captive: { term: 'Captive', group: 'Intrigue', text: 'Someone held by another house. Interrogate them, ransom them, release them, or execute them.' },
  ransom: { term: 'Ransom', group: 'Intrigue', text: "Othes paid for a captive's return. Their house may refuse; yours may be asked to pay." },
  exposed: { term: 'Exposed', group: 'Intrigue', text: 'An agent whose face another house now knows.' },
  embezzler: { term: 'Embezzler', group: 'Intrigue', text: 'An overseer caught skimming the takings.' },
};

export const GLOSSARY_GROUPS: GlossaryGroup[] = ['Time', 'Houses', 'Holdings', 'Economy', 'People', 'Attributes', 'Hidden', 'Council', 'Missions', 'Intrigue'];
