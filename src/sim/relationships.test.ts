import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { bondOf, factions, opinion, setBond, shiftBoth, shiftOpinion, synergy, tiesOf, onDeath } from './relationships';

const world = createWorld();
const P = world.playerHouseId;
const all = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full');
const ours = all.filter((c) => c.seat !== 'highroy' && c.role !== 'Spouse of the Highroy' && !bondOf(world, all[0]!.id, c.id));
const lordOf = () => all.find((c) => c.seat === 'highroy')!;

describe('relationships', () => {
  it('marries the Highroy to their spouse from the start', () => {
    const lord = lordOf();
    const spouse = all.find((c) => c.role === 'Spouse of the Highroy');
    if (spouse) expect(bondOf(world, lord.id, spouse.id)).toBe('spouse');
  });

  it('shifts opinions with reasons and clamps them', () => {
    const w = structuredClone(world);
    const [a, b] = ours;
    shiftOpinion(w, a!.id, b!.id, 500, 'saved my life');
    expect(opinion(w, a!.id, b!.id)).toBe(100);
    expect(tiesOf(w, a!.id).find((t) => t.other === b!.id)?.reasons[0]).toMatch(/saved my life/);
  });

  it('turns strong mutual feeling into a friendship and hatred into a rivalry', () => {
    const w = structuredClone(world);
    const [a, b, c] = ours;
    shiftBoth(w, a!.id, b!.id, 80, 'shared hardship');
    expect(bondOf(w, a!.id, b!.id)).toBe('friend');
    shiftBoth(w, a!.id, c!.id, -90, 'an insult');
    expect(bondOf(w, a!.id, c!.id)).toBe('rival');
  });

  it('makes friends work better together than rivals', () => {
    const w = structuredClone(world);
    const [a, b, c, d] = ours;
    shiftBoth(w, a!.id, b!.id, 80, 'x');
    shiftBoth(w, c!.id, d!.id, -90, 'y');
    expect(synergy(w, [a!.id, b!.id])).toBeGreaterThan(1);
    expect(synergy(w, [c!.id, d!.id])).toBeLessThan(1);
  });

  it('groups friends into factions', () => {
    const w = structuredClone(world);
    const [a, b] = ours;
    setBond(w, a!.id, b!.id, 'friend', 'friend', 'test');
    expect(factions(w, P).some((g) => g.includes(a!.id) && g.includes(b!.id))).toBe(true);
  });

  it('grieves the dead', () => {
    const w = structuredClone(world);
    const [a, b] = ours;
    shiftBoth(w, a!.id, b!.id, 80, 'x');
    const before = w.characters[a!.id]!.mood ?? 0;
    onDeath(w, b!.id);
    expect(w.characters[a!.id]!.mood ?? 0).toBeLessThanOrEqual(before);
  });

  it('moves over time and survives a save', () => {
    let w = world;
    for (let i = 0; i < 40; i++) w = advanceTurn(w);
    const total = Object.values(w.ties).reduce((n, row) => n + Object.keys(row).length, 0);
    expect(total).toBeGreaterThan(Object.values(world.ties).reduce((n, row) => n + Object.keys(row).length, 0));
    const back = deserialize(serialize(w));
    expect(back.ties).toEqual(w.ties);
  });
});
