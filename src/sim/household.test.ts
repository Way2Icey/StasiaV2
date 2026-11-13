import { createWorld } from './world';
import { advanceTurns } from './tick';
import {
  agentsOf, cannotCounsel, counselled, isHouseholdNoble, knightReady, occupationOf, recruitAgent, seekWisdom, setOccupation,
} from './household';
import { courtTotals } from './court';
import { envoysOf } from './politics';
import { partySkill } from './missions';
import { ruler, seatHolder } from './query';
import { moodOf } from './mood';

const base = createWorld();
const P = base.playerHouseId;

describe('noble occupations', () => {
  it('nobles start as court helpers and can be set idle, envoy or knight', () => {
    const nobles = Object.values(base.characters).filter((c) => c.houseId === P && isHouseholdNoble(c) && occupationOf(c) === 'courtier');
    expect(nobles.length).toBeGreaterThan(5);
    const n = nobles[0]!;
    const before = courtTotals(base, P).income;
    const idle = setOccupation(base, P, n.id, 'idle');
    expect(occupationOf(idle.characters[n.id]!)).toBe('idle');
    expect(courtTotals(idle, P).income).toBeLessThanOrEqual(before);
    const fighter = nobles.find((c) => !knightReady(c));
    if (fighter) expect(setOccupation(base, P, fighter.id, 'knight').characters[fighter.id]!.role).toBe('Knight');
    const weak = nobles.find((c) => knightReady(c));
    if (weak) expect(() => setOccupation(base, P, weak.id, 'knight')).toThrow(/Not ready/);
  });

  it('the envoy corps is capped at four', () => {
    let w = base;
    const nobles = Object.values(base.characters).filter((c) => c.houseId === P && occupationOf(c) === 'courtier' && isHouseholdNoble(c));
    for (const n of nobles) {
      if (envoysOf(w, P).length >= 4) { expect(() => setOccupation(w, P, n.id, 'envoy')).toThrow(/four|4/); break; }
      w = setOccupation(w, P, n.id, 'envoy');
    }
    expect(envoysOf(w, P).length).toBe(4);
  });
});

describe("the Elder's counsel", () => {
  it('gives an Orbit of sharper work, once a Phase', () => {
    const hr = ruler(base, P)!;
    const spy = seatHolder(base, P, 'spymaster')!;
    const w = seekWisdom(base, P, spy.id);
    expect(counselled(w.characters[spy.id])).toBe(true);
    expect(moodOf(w.characters[spy.id]!)).toBeGreaterThan(moodOf(spy));
    expect(partySkill('investigate', w.characters[spy.id]!, [])).toBeGreaterThan(partySkill('investigate', spy, []));
    expect(cannotCounsel(w, P)).toMatch(/once a Phase/);
    expect(() => seekWisdom(w, P, hr.id)).toThrow();
    const later = advanceTurns(w, 9);
    expect(cannotCounsel(later, P)).toBeNull();
    expect(counselled(advanceTurns(w, 41).characters[spy.id])).toBe(false);
  });
});

describe("the Spymaster's agents", () => {
  it('recruits envoys only, up to his limit', () => {
    const envoy = envoysOf(base, P)[0]!;
    const w = recruitAgent(base, P, envoy.id);
    expect(agentsOf(w, P).map((c) => c.id)).toContain(envoy.id);
    const noble = Object.values(base.characters).find((c) => c.houseId === P && occupationOf(c) === 'courtier' && isHouseholdNoble(c))!;
    expect(() => recruitAgent(w, P, noble.id)).toThrow(/envoys/);
    // Leaving the corps ends the spying.
    const out = setOccupation(w, P, envoy.id, 'courtier');
    expect(agentsOf(out, P)).toHaveLength(0);
  });
});
