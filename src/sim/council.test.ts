import { createWorld } from './world';
import { advanceTurn, advanceTurns } from './tick';
import { deserialize, serialize } from './save';
import {
  abandonOath, assignTask, dismissPetition, OATH_LENGTH, oathProgress, OATHS, swearOath, TASKS,
} from './council';
import { relation } from './relations';
import { forecast, launchMission } from './missions';
import { seatHolder } from './query';
import { absoluteCycle } from './time';

const world = createWorld();
const P = world.playerHouseId;

describe('council', () => {
  it('starts every house with standing, relations and default tasks', () => {
    for (const h of Object.values(world.houses)) {
      expect(h.standing.honour).toBeGreaterThan(0);
      expect(world.courts[h.id]).toBeDefined();
      for (const o of Object.keys(world.houses)) if (o !== h.id) expect(typeof relation(world, h.id, o)).toBe('number');
    }
    expect(world.courts[P]!.tasks.steward?.task).toBe('keepOrder');
  });

  it('every seat task runs for a long time without breaking', () => {
    let w = world;
    // Give each seat each of its tasks in turn.
    const seats = [...new Set(TASKS.map((t) => t.seat))];
    for (let round = 0; round < 2; round++) {
      for (const seat of seats) {
        const options = TASKS.filter((t) => t.seat === seat);
        const t = options[round % options.length]!;
        w = assignTask(w, P, seat, t.id, t.target === 'house' ? 'serath' : undefined);
      }
      w = advanceTurns(w, 30);
    }
    const reports = w.courts[P]!.reports;
    expect(reports.length).toBeGreaterThan(5);
    for (const s of Object.values(w.planets).flatMap((p) => p.sectors)) {
      expect(s.unrest).toBeGreaterThanOrEqual(0);
      expect(s.roomUsed).toBeLessThanOrEqual(s.room);
    }
    for (const c of Object.values(w.characters)) for (const v of Object.values(c.stats)) expect(v).toBeLessThanOrEqual(20);
  });

  it('courting a house warms it', () => {
    let w = assignTask(world, P, 'envoy', 'courtHouse', 'torvann');
    const before = relation(w, 'torvann', P);
    w = advanceTurns(w, 30);
    expect(relation(w, 'torvann', P)).toBeGreaterThan(before);
  });

  it('oaths are sworn, measured and closed', () => {
    for (const o of OATHS) {
      let w = swearOath(world, P, o.id, o.target ? 'serath' : undefined);
      expect(oathProgress(w, P)).not.toBeNull();
      expect(() => swearOath(w, P, o.id, 'serath')).toThrow();
      const honour = w.houses[P]!.standing.honour;
      w = advanceTurns(w, OATH_LENGTH / 2 + 1);
      expect(w.courts[P]!.oath).toBeNull();
      const rec = w.courts[P]!.oaths[0]!;
      expect(['kept', 'broken']).toContain(rec.result);
      expect(w.houses[P]!.standing.honour).not.toBe(honour);
    }
  });

  it('abandoning an oath costs honour', () => {
    const w = swearOath(world, P, 'raiseName');
    const after = abandonOath(w, P);
    expect(after.houses[P]!.standing.honour).toBe(w.houses[P]!.standing.honour - 6);
    expect(after.courts[P]!.oaths[0]!.result).toBe('abandoned');
  });

  it('petitions arrive under an oath and can be dismissed', () => {
    let w = swearOath(world, P, 'knowRivals');
    for (let i = 0; i < 40 && w.courts[P]!.petitions.length === 0; i++) w = advanceTurn(w);
    const p = w.courts[P]!.petitions[0];
    expect(p).toBeDefined();
    expect(absoluteCycle(p!.expires)).toBeGreaterThan(absoluteCycle(p!.date));
    const d = dismissPetition(w, P, p!.id);
    expect(d.courts[P]!.petitions.find((x) => x.id === p!.id)).toBeUndefined();
  });

  it('envoy missions change regard', () => {
    const envoy = seatHolder(world, P, 'envoy')!;
    const f = forecast(world, { kind: 'envoy', houseId: P, leaderId: envoy.id, targetHouseId: 'shaaliin', approach: 'careful' });
    expect(f.ok).toBe(true);
    if (f.ok) expect(f.noticed).toBe(0);
    let { world: w, id } = launchMission(world, { kind: 'envoy', houseId: P, leaderId: envoy.id, targetHouseId: 'shaaliin', approach: 'careful' });
    w = advanceTurns(w, 20);
    const m = w.missions[id]!;
    expect(m.stage).toBe('done');
    expect(m.findings?.[0]).toMatch(/Shaaliin/);
  });

  it('round-trips and migrates v2 saves', () => {
    expect(deserialize(serialize(world))).toEqual(world);
    const old = JSON.parse(serialize(world));
    old.version = 2;
    delete old.courts;
    delete old.relations;
    for (const h of Object.values(old.houses) as { standing?: unknown }[]) delete h.standing;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(4);
    expect(w.courts[P]!.tasks.spymaster).toBeDefined();
    expect(w.houses[P]!.standing.honour).toBeGreaterThan(0);
  });
});
