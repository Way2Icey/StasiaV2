import { createWorld } from './world';
import { advanceTurns } from './tick';
import { answerNews, appointEnvoy, envoyCandidates, envoysOf, mayLeadEnvoy, setStance } from './politics';
import { forecast } from './missions';
import { relation } from './relations';
import { seatHolder } from './query';
import { deserialize, serialize } from './save';

const base = createWorld();
const P = base.playerHouseId;

describe('the Speaker and the envoy corps', () => {
  it('every house starts with a Speaker and a small corps', () => {
    for (const h of Object.keys(base.houses)) expect(envoysOf(base, h).length).toBeGreaterThan(0);
    expect(seatHolder(base, P, 'envoy')!.role).toBe('Speaker of the Council');
  });

  it('only the Speaker, envoys or the Highroy lead envoy missions', () => {
    const noble = envoyCandidates(base, P)[0]!;
    expect(mayLeadEnvoy(noble)).toBe(false);
    const f = forecast(base, { kind: 'envoy', houseId: P, leaderId: noble.id, targetHouseId: 'serath', approach: 'careful' });
    expect(f.ok).toBe(false);
    const w = appointEnvoy(base, P, noble.id);
    expect(forecast(w, { kind: 'envoy', houseId: P, leaderId: noble.id, targetHouseId: 'serath', approach: 'careful' }).ok).toBe(true);
  });

  it('a friendly stance warms, an opposed one cools', () => {
    const before = relation(base, 'torvann', P);
    const warm = advanceTurns(setStance(base, P, 'torvann', 'friendly'), 40);
    const cold = advanceTurns(setStance(base, P, 'torvann', 'opposed'), 40);
    expect(relation(warm, 'torvann', P)).toBeGreaterThan(relation(cold, 'torvann', P));
    void before;
  });

  it('news can be answered once', () => {
    const item = { key: 'k', houseId: 'serath', date: base.date, text: 'x' };
    const w = answerNews(base, P, item, 'condemn');
    expect(relation(w, 'serath', P)).toBe(relation(base, 'serath', P) - 8);
    expect(serialize(answerNews(w, P, item, 'condemn'))).toBe(serialize(w));
  });

  it('upgrades a version 7 save, renaming the envoy seat', () => {
    const old = JSON.parse(serialize(base));
    old.version = 7;
    delete old.stances;
    delete old.answered;
    for (const c of Object.values(old.characters) as { seat?: string; role: string }[]) if (c.seat === 'envoy') c.role = 'Envoy';
    for (const c of Object.values(old.characters) as { seat?: string; role: string }[]) if (!c.seat && c.role === 'Envoy') c.role = 'Noble';
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(10);
    expect(seatHolder(w, P, 'envoy')!.role).toBe('Speaker of the Council');
    expect(envoysOf(w, P).length).toBe(2);
  });
});
