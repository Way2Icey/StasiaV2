# Stasia

A house-management game set in the Houses of Archon: Football Manager's depth with Crusader Kings' politics. You head a house, manage its people, and climb toward becoming Exarchon.

The design lives in the Stasia game design document: https://claude.ai/artifact/VbtZRnq1n6NbDtp1uwpYnx
**Start with its last six sections** (Build status, How the built systems work, Code map, Working rules,
Where the build differs from this design, Next up). They describe what is built, the numbers in code, the
workflow, Isaiah's standing rules and the open naming questions. Lore lives in Isaiah's Obsidian vault.

## Status

Milestones 1-6 are built (75 tests passing); 1-4 are merged to `main`:

1. Foundation: LPS calendar, seeded world and saves, four houses and worlds, culture-named people, deaths and succession.
2. Knowledge fog and the Investigate and Scout missions.
3. Council tasks, the Highroy's oath, petitions, house standing and regard, Envoy missions.
4. Rival houses that act on their own, counter-intelligence, captives.
5. The economy: othes and five resources, quarters producing, taxes, the Navisium quota, the Imperial Exchange, mission costs, audits, ransom.
6. The field: mood, field slots, who will go, the court at home, the Highroy and parties of up to three, ordering the unwilling; missions turn up talented people, Caiges, secrets, sites and trade deals; hover definitions and a glossary.

Next: the Chronicle. Work happens on `dev`; merge to `main` only after Isaiah approves.

## Layout

```
src/sim/    simulation (no UI code): rng, time, names, characters, world, tick, knowledge,
            missions, council, relations, ai, captives, death, save, query
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
