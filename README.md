# Stasia

A house-management game set in the Houses of Archon: Football Manager's depth with Crusader Kings' politics. You head a house, manage its people, and climb toward becoming Exarchon.

The design lives in the Stasia game design document; lore lives in the Obsidian vault.

## Status

**Milestone 1: Foundation** (vertical slice)

- LPS calendar: Cycles, Phases (16 Cycles), Orbits (80), years (800). Continue advances 2 Cycles.
- Seeded world: the same seed always builds the same world, and saves continue identically.
- Houses Alerion, Torvann, Serath and Shaaliin, each with a capital, sectors and quarters.
- Generated people named from each house's culture (Fokari line names, Torvann holds and scar-names, Serathi callsigns, Shaaliin public/court/true names), with Mind/Body/Spirit stats, hidden stats, traits and status flags.
- Old age, deaths, mourning and succession.
- Save and load (browser slot, save code, file).

Next: knowledge fog and detail levels, then missions and events.

## Layout

```
src/sim/    simulation: rng, time, names, characters, world, tick, save (no UI code)
src/data/   game content: species, cultures, traits, flags, houses, planets
src/ui/     React interface
scripts/    build helpers
```

## Commands

```
npm install
npm run dev          # local dev server
npm test             # simulation tests
npm run build        # single-file build in dist/index.html
npm run build:page   # also writes dist/stasia-page.html for publishing as a page
```
