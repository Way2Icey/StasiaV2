import { createWorld } from './world';
import { advanceTurns } from './tick';
import { availability, forecast, launchMission, partySkill, skillFor } from './missions';
import { courtOf, courtTotals, highroyAway, isAway } from './court';
import { moodOf } from './mood';
import { phaseLedger } from './economy';
import { ruler, seatHolder } from './query';

const base = createWorld();
const P = base.playerHouseId;

describe('the court at home', () => {
  it('nobles at home add bonuses by their place', () => {
    const places = courtOf(base, P);
    expect(places.some((p) => p.place === 'Consort')).toBe(true);
    expect(places.some((p) => p.place === 'Heir')).toBe(true);
    expect(places.some((p) => p.place === 'Head of a family')).toBe(true);
    const t = courtTotals(base, P);
    expect(t.income).toBeGreaterThan(0);
    expect(t.tasks).toBeGreaterThan(0);
    expect(phaseLedger(base, P).some((l) => l.kind === 'court')).toBe(true);
  });

  it('sending a noble out loses their bonus', () => {
    const consort = courtOf(base, P).find((p) => p.place === 'Consort')!.character;
    const before = courtTotals(base, P).tasks;
    const { world } = launchMission(base, { kind: 'envoy', houseId: P, leaderId: consort.id, targetHouseId: 'serath', approach: 'careful', force: [consort.id] });
    expect(isAway(world, consort.id)).toBe(true);
    expect(courtTotals(world, P).tasks).toBeLessThan(before);
  });
});

describe('parties, the Highroy and orders', () => {
  it('the Highroy can lead, and companions add to the party', () => {
    const hr = ruler(base, P)!;
    const champ = seatHolder(base, P, 'champion')!;
    const spy = seatHolder(base, P, 'spymaster')!;
    expect(availability(base, P, hr).ok).toBe(true);
    expect(partySkill('scout', hr, [champ, spy])).toBeGreaterThan(skillFor('scout', hr));
    const moods = [moodOf(champ), moodOf(spy)];
    const { world, id } = launchMission(base, { kind: 'scout', houseId: P, leaderId: hr.id, companions: [champ.id, spy.id], targetPlanetId: 'serath-reach', approach: 'careful' });
    expect(highroyAway(world, P)).toBe(true);
    expect(world.missions[id]!.companions).toEqual([champ.id, spy.id]);
    // Riding with the Highroy is an honour.
    expect(moodOf(world.characters[champ.id]!)).toBeGreaterThan(moods[0]!);
    const done = advanceTurns(world, 20);
    expect(done.missions[id]!.stage).toBe('done');
    expect(isAway(done, champ.id) || done.captives[hr.id] !== undefined).toBe(false);
  });

  it('the unwilling can refuse, and the Highroy can force them at a cost', () => {
    const w = structuredClone(base);
    const knight = Object.values(w.characters).find((c) => c.houseId === P && c.role === 'Knight')!;
    knight.mood = 10;
    const a = availability(w, P, knight);
    expect(a.ok).toBe(false);
    expect(a.forceable).toBe(true);
    const spec = { kind: 'scout' as const, houseId: P, leaderId: knight.id, targetPlanetId: 'serath-reach', approach: 'careful' as const };
    expect(forecast(w, spec).ok).toBe(false);
    const { world, id } = launchMission(w, { ...spec, force: [knight.id] });
    expect(world.missions[id]!.forced).toEqual([knight.id]);
    expect(moodOf(world.characters[knight.id]!)).toBe(0);
    // The wounded cannot be forced.
    const hurt = structuredClone(base);
    const k2 = Object.values(hurt.characters).find((c) => c.houseId === P && c.role === 'Knight')!;
    k2.flags.push({ id: 'wounded', since: hurt.date });
    expect(availability(hurt, P, k2).forceable).toBeFalsy();
    expect(() => launchMission(hurt, { ...spec, leaderId: k2.id, force: [k2.id] })).toThrow(/Wounded/);
  });
});
