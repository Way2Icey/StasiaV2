/// <reference types="vite/client" />
import { GLOSSARY } from '../data/glossary';
import { ALL_STATS, HIDDEN_STATS } from './types';

describe('glossary', () => {
  it('every term used in the interface has a definition', () => {
    const files = import.meta.glob('../ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const used = new Set<string>();
    for (const text of Object.values(files)) {
      for (const m of text.matchAll(/<Term k="([^"]+)"/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const k of used) expect(GLOSSARY[k], k).toBeDefined();
  });

  it('defines every stat, seat and resource', () => {
    for (const s of [...ALL_STATS, ...HIDDEN_STATS]) expect(GLOSSARY[`stat:${s}`], s).toBeDefined();
    for (const s of ['grandMaster', 'envoy', 'spymaster', 'steward', 'physician', 'elder', 'champion', 'highroy']) expect(GLOSSARY[`seat:${s}`], s).toBeDefined();
    for (const r of ['othes', 'navisium', 'metals', 'provisions', 'fuel', 'components', 'mind', 'body', 'spirit', 'greatHouse', 'minorHouse']) expect(GLOSSARY[r], r).toBeDefined();
  });
});
