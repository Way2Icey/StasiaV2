// The Archive: fragments of the past a house can gather, from Echo Coins, old writs, station logs, its
// scholars and its prisoners. Every fragment comes from someone, and everyone had a side: nothing here is
// the whole truth, and some fragments contradict others. The canon is the backbone (the War for God, Peace
// and Life; Vaelor Primus; the Rend; the Silence; the Drift Era); the voices are invented. Nothing in the
// Archive is ever finally correct, and some threads are never closed.

export type ThreadId = 'war' | 'vaelor' | 'rend' | 'silence' | 'will' | 'drift' | 'souls' | 'clrch' | 'legions' | 'navisium';
export type Slant = 'pious' | 'bitter' | 'scholar' | 'soldier' | 'rumour' | 'witness';

export interface Fragment {
  id: string;
  thread: ThreadId;
  /** Within its thread; for the Drift, fragments come in this order and no other. */
  order: number;
  title: string;
  source: string;
  slant: Slant;
  text: string;
  /** Disputes another fragment. */
  disputes?: string;
}

export const THREADS: Record<ThreadId, { title: string; note: string; open?: boolean }> = {
  war: { title: 'The War for God, Peace and Life', note: 'Some fifteen hundred years of war, under three names.' },
  vaelor: { title: 'The First Error', note: 'Exarchon Vaelor Primus and the vision that began it.' },
  rend: { title: 'The Rend', note: 'The end of the war, which no one signed.' },
  silence: { title: 'The Silence', note: 'When the stars stopped speaking to each other.' },
  will: { title: 'On the Weight of Will', note: 'A disputed text, copied and burned and copied again.' },
  drift: { title: 'What the Caiges Remember', note: 'Something moves through navisium. No one agrees what.', open: true },
  souls: { title: 'Souls in the Metal', note: 'What a Caige holds, and what will not be held.' },
  clrch: { title: 'Five Letters', note: 'Objects marked CLRCH. No one knows what they are.', open: true },
  legions: { title: 'The Lost Legions', note: 'Legions that marched into the war and did not come out of it.' },
  navisium: { title: 'The Metal of Will', note: 'Where navisium comes from, and why it is rationed.' },
};

export const SLANT_LABEL: Record<Slant, string> = {
  pious: 'a believer', bitter: 'a bitter hand', scholar: 'a scholar', soldier: 'a soldier', rumour: 'rumour', witness: 'a witness',
};

export const FRAGMENTS: Fragment[] = [
  // The war
  { id: 'war1', thread: 'war', order: 1, title: 'The first name', source: 'A hymn-sheet from a chapel ship', slant: 'pious', text: 'We marched for God. The Exarchon saw what the Celarchs wanted, and what they wanted was one people under one will. There is no shame in a holy war. There is only shame in losing it.' },
  { id: 'war2', thread: 'war', order: 2, title: 'The second name', source: 'A quartermaster\'s ledger, four hundred years in', slant: 'bitter', text: 'Nobody says God any more. Now it is the War for Peace: we fight so our grandchildren will not have to. My grandfather said that too. Fuel requisitions for the Orbit attached.' },
  { id: 'war3', thread: 'war', order: 3, title: 'The third name', source: 'A letter found in a soldier\'s boot', slant: 'soldier', text: 'They call it the War for Life now, which means they have run out of reasons and kept the war. Tell Mother I am well. Tell her nothing else.' },
  { id: 'war4', thread: 'war', order: 4, title: 'Momentum', source: 'A Numarade clerk\'s marginal note', slant: 'scholar', text: 'The Assembly kept it going with their ledgers and their institutions, and we kept it going with our faith and our names. Neither side could stop without admitting the dead had died for nothing.' },
  { id: 'war5', thread: 'war', order: 5, title: 'Fifteen hundred years', source: 'A house chronicler', slant: 'scholar', text: 'Count the generations and the number stops meaning anything. Forty, fifty lifetimes of war. Whole houses were born, rose, ruled and died without ever knowing peace.' },

  // Vaelor Primus
  { id: 'vae1', thread: 'vaelor', order: 1, title: 'The vision', source: 'A crusade writ, much repaired', slant: 'pious', text: 'In the deep resonance the Exarchon Vaelor Primus saw the Celarchs, and they spoke of unity. Let every house take up the Caige. Let the one will be done.' },
  { id: 'vae2', thread: 'vaelor', order: 2, title: 'What he did not see', source: 'A heretic\'s commentary, unsigned', slant: 'scholar', text: 'Visions in resonance are partial. Ask any bearer. Vaelor heard a fragment and called it a command. The Celarchs, whatever they are, have never commanded anything. That is the whole of the matter.', disputes: 'vae1' },
  { id: 'vae3', thread: 'vaelor', order: 3, title: 'The crusade\'s oath', source: 'An oath-plate from a legion chapel', slant: 'pious', text: 'I bind my house to the crusade until the will is one. (Below, scratched in a later hand: It never was.)' },

  // The Rend
  { id: 'ren1', thread: 'rend', order: 1, title: 'The week before', source: 'A shipwright\'s diary', slant: 'witness', text: 'The systems are failing one by one. The Caiges in the armoury have gone dull, like stones. The old bearers sit with them and will not speak. Something is coming. Everyone can feel it and no one can say what.' },
  { id: 'ren2', thread: 'rend', order: 2, title: 'The moment', source: 'An Echo Coin, recovered from a burned chapel', slant: 'witness', text: '(Thirty seconds of sound. A crowd, then no crowd. Then a single voice, very calm: "Did you feel that?" Then nothing.)' },
  { id: 'ren3', thread: 'rend', order: 3, title: 'The count', source: 'An archivist of the Numarade', slant: 'scholar', text: 'Navisium everywhere answered at once, the same note on every world. Caiges broke loose from their bearers. We do not know how many died. The word used is billions, because no one could count further.' },
  { id: 'ren4', thread: 'rend', order: 4, title: 'Blame', source: 'A sermon of the Drift Era', slant: 'pious', text: 'It was the Assembly\'s doing: their machines, their arrogance. The Celarchs\' judgment fell on them, and we were caught in the blast.', disputes: 'ren5' },
  { id: 'ren5', thread: 'rend', order: 5, title: 'Blame, again', source: 'A captured enemy pamphlet, translated', slant: 'bitter', text: 'Archon\'s Caige-worship did this. Fifteen centuries of pouring souls into metal, and they were surprised when the metal answered.', disputes: 'ren4' },
  { id: 'ren6', thread: 'rend', order: 6, title: 'Two names', source: 'A scholar\'s cipher, half decoded', slant: 'rumour', text: 'Some say the Rend had makers, two of them, who meant to end the war by building something that knew everything. The names that come up in the oldest whispers are Lumen and Rhyst. No court record mentions either.' },

  // The Silence
  { id: 'sil1', thread: 'silence', order: 1, title: 'Last transmission', source: 'A station log', slant: 'witness', text: 'Relay dark. Relay dark. All relays dark. We will keep the lights on as long as the fuel holds. If anyone hears this, the docking ring is still sound.' },
  { id: 'sil2', thread: 'silence', order: 2, title: 'Peace by fear', source: 'A Numarade proclamation', slant: 'pious', text: 'Peace is declared. No house will cross the dark between the stars without leave. Any ship seen in the lanes without leave will be presumed to carry the Rend with it.' },
  { id: 'sil3', thread: 'silence', order: 3, title: 'The ones left behind', source: 'A derelict\'s mess-hall wall', slant: 'witness', text: 'Day 2,000 by our count. Still no word. The children born here have never seen a ship come in. We teach them the names of the stars anyway.' },
  { id: 'sil4', thread: 'silence', order: 4, title: 'How it ended', source: 'A house chronicler', slant: 'scholar', text: 'Nobody ended the Silence. Generations passed, and one day a trader came through the dark and nobody shot her. That is how the Drift Era began: by people forgetting to be afraid.' },

  // On the Weight of Will
  { id: 'wil1', thread: 'will', order: 1, title: 'Desire and will', source: 'On the Weight of Will, a copy', slant: 'scholar', text: 'Desire wants. Will commits. To will a thing is to bind yourself to what comes of it.' },
  { id: 'wil2', thread: 'will', order: 2, title: 'On certainty', source: 'On the Weight of Will, a second copy', slant: 'scholar', text: 'Certainty is not the presence of weight but its absence. The certain have put their burden down and call it strength.' },
  { id: 'wil3', thread: 'will', order: 3, title: 'A rebuttal', source: 'A war-priest\'s answer, nailed to a chapel door', slant: 'pious', text: 'The book says nothing is certain. Then the book is not certain either, and may be burned. (It was.)', disputes: 'wil2' },
  { id: 'wil4', thread: 'will', order: 4, title: 'The last page', source: 'On the Weight of Will, a damaged copy', slant: 'scholar', text: 'Meaning is not guaranteed. Responsibility is unavoidable. Act, because you cannot be sure.' },

  // The Drift, in order, never finished
  { id: 'dri1', thread: 'drift', order: 1, title: 'Instability', source: 'An armourer\'s report', slant: 'soldier', text: 'Third Caige this year to change its weight overnight. The bearers swear they did nothing. I have written it down as instability, because I do not know what else to write.' },
  { id: 'dri2', thread: 'drift', order: 2, title: 'The same dream', source: 'A physician\'s notes', slant: 'scholar', text: 'Four bearers from four houses, who have never met, describe the same dream: a river, very wide, and everyone in it walking the same way.' },
  { id: 'dri3', thread: 'drift', order: 3, title: 'In step', source: 'A spymaster\'s report', slant: 'rumour', text: 'They move together without speaking. They finish each other\'s sentences across a room. The common folk call them Echo Bearers. Ours wants to know if he is one.' },
  { id: 'dri4', thread: 'drift', order: 4, title: 'Not yours alone', source: 'Scratched into a Caige hilt', slant: 'witness', text: 'The will that is yours is no longer yours alone.' },
  { id: 'dri5', thread: 'drift', order: 5, title: 'A word for it', source: 'A scholar\'s letter, never sent', slant: 'scholar', text: 'There was a construct of navisium, holding more minds than anyone could count. The oldest texts call it the Lattice. If something moves through every Caige at once, it moves from there.' },
  { id: 'dri6', thread: 'drift', order: 6, title: 'A name', source: 'A sealed page in a dead scholar\'s hand', slant: 'rumour', text: 'They call it the Axiom. It does not want worship and it does not want rule. It wants an answer, and it believes it has one. I will not write the answer down.' },

  // Souls
  { id: 'sou1', thread: 'souls', order: 1, title: 'What a Caige is', source: 'An armourer\'s primer', slant: 'scholar', text: 'A Caige is not a weapon that holds a soul. It is a soul that has agreed, or been made, to be a weapon. It shows you who you are. It does not make you anything.' },
  { id: 'sou2', thread: 'souls', order: 2, title: 'The ones that will not bend', source: 'A bonding-master\'s warning', slant: 'witness', text: 'One in a billion, they say. A soul that cannot be swayed while anything of it remains. Every bonding-master has a story of one. Most of the stories end badly.' },
  { id: 'sou3', thread: 'souls', order: 3, title: 'Fracture', source: 'A report on a shattered Caige', slant: 'scholar', text: 'When a Caige breaks after long and deep bonding, the place remembers. People who walk there afterwards report grief that is not theirs. The ground itself has an echo.' },

  // CLRCH, never finished
  { id: 'clr1', thread: 'clrch', order: 1, title: 'Five letters', source: 'A dealer\'s catalogue', slant: 'rumour', text: 'Item 114: ring, grey, very dense, marked CLRCH. Origin unknown. Dormant. Buyers have returned it, saying it is heavier than it should be. Priced to move.' },
  { id: 'clr2', thread: 'clrch', order: 2, title: 'No vowels', source: 'A scholar\'s note', slant: 'scholar', text: 'Every object marked this way carries the same five letters and no others. It reads like a word with its vowels taken out. I can think of one word that fits, and I am not willing to say it in a house chapel.' },
  { id: 'clr3', thread: 'clrch', order: 3, title: 'Dormant', source: 'An armourer\'s test record', slant: 'witness', text: 'Tested against three Caiges, a resonance gauge and a bonding-master. No response from any. Then, when everyone had left, the gauge moved once. Test inconclusive.' },
  { id: 'clr4', thread: 'clrch', order: 4, title: 'A pattern', source: 'A Capanna scholar\'s private ledger', slant: 'rumour', text: 'Of the marked objects whose finding is recorded, none was found where anyone was looking for it. Each was simply there: in a dead man\'s pocket, in a market crate, in a sealed vault nobody had opened.' },

  // The lost legions
  { id: 'leg1', thread: 'legions', order: 1, title: 'The order of a legion', source: 'A recruit\'s catechism', slant: 'soldier', text: 'Ten soldiers to a Knight, ten Knights to a Knight Commander, ten Commanders to a High Knight, ten High Knights to the Grand Master. Above the Grand Master the Grand Marshal, and above the Grand Marshal, the Exarchon.' },
  { id: 'leg2', thread: 'legions', order: 2, title: 'Marched out', source: 'A roll of honour, burned at the edges', slant: 'soldier', text: 'The legion of a house now ended marched into the Old Front with its banners and was not heard from again. Its banner turns up now and then in a dealer\'s stall, and someone always pays too much for it.' },
  { id: 'leg3', thread: 'legions', order: 3, title: 'What the banners mean', source: 'A herald\'s handbook', slant: 'scholar', text: 'To fly a lost legion\'s banner is to claim its memory. Some houses think that is honour, some think it is theft, and many quarrels have started over a strip of old cloth.' },

  // Navisium
  { id: 'nav1', thread: 'navisium', order: 1, title: 'Grey stone', source: 'A miner\'s song', slant: 'witness', text: 'Shiny and grey, a stone, a stone, until it knows you. Then it is whatever you are.' },
  { id: 'nav2', thread: 'navisium', order: 2, title: 'Why it is rationed', source: 'A Numarade ordinance', slant: 'pious', text: 'Navisium is drawn from few worlds and at great cost. The Numarade holds the Reserve and grants each house its quota, so that no house may arm itself beyond the others and bring back the war.' },
  { id: 'nav3', thread: 'navisium', order: 3, title: 'Saturation', source: 'A scholar\'s treatise', slant: 'scholar', text: 'Fifteen centuries of the war poured will and grief into the metal. Some say navisium from the old battlefields is different, heavier with memory. It fetches a higher price, and the people who carry it sleep badly.' },
];

export const FRAGMENT_BY_ID: Record<string, Fragment> = Object.fromEntries(FRAGMENTS.map((f) => [f.id, f]));
export const fragmentsOf = (t: ThreadId) => FRAGMENTS.filter((f) => f.thread === t).sort((a, b) => a.order - b.order);
