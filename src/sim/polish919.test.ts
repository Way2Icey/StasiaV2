import { createWorld } from './world';
import { advanceTurns } from './tick';
import { Rng } from './rng';
import { advanceQuests } from './quests';
import { absoluteCycle } from './time';
import { dismissBriefings, openBriefings } from './briefings';

describe('9.19: the board, the bulletin and the door', () => {
  it('work lately done stays off the board, and the founder\'s blade, once found, never comes back', () => {
    const w = structuredClone(createWorld());
    const r = new Rng(w.rng);
    w.quests = { board: [], lately: { 'Escort the Steward\'s factors through the lanes': absoluteCycle(w.date) }, found: ["Find the lost blade of the house's founder"] };
    for (let i = 0; i < 30; i++) { w.quests.board = []; advanceQuests(w, r, true); }
    const titles = w.quests.board.map((q) => q.title);
    expect(titles).not.toContain("Find the lost blade of the house's founder");
    expect(titles).not.toContain('Escort the Steward\'s factors through the lanes');
  });

  it('the bulletin leads with where we stand, and names first place only when it changes', () => {
    const w = advanceTurns(structuredClone(createWorld()), 120);
    const bs = w.rankings?.bulletins ?? [];
    expect(bs.length).toBeGreaterThan(1);
    expect(bs[0]!.lines[0]!.tone).toBe('ours');
    const holds = bs.filter((b) => b.lines.some((l) => /holds first place/.test(l.text)));
    expect(holds.length).toBe(0);
  });

  it('reports already seen to can be thanked all at once', () => {
    const w = advanceTurns(structuredClone(createWorld()), 80);
    const done = openBriefings(w).filter((b) => b.done);
    expect(done.length).toBeGreaterThan(0);
    const x = dismissBriefings(w, done.map((b) => b.id));
    expect(openBriefings(x).some((b) => b.done)).toBe(false);
  });
});
