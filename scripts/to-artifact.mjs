// Turns the single-file build (dist/index.html) into a page body suitable for
// publishing as a claude.ai artifact: the publisher adds its own <!doctype>,
// <html>, <head> and <body>, so we keep only the title, metas, links, styles,
// scripts and the root element.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist/index.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';

const keep = [];
const title = head.match(/<title>[\s\S]*?<\/title>/i);
if (title) keep.push(title[0]);
for (const m of head.matchAll(/<meta\s+name="claude:[^>]*>/gi)) keep.push(m[0]);
for (const m of head.matchAll(/<link\s[^>]*fonts\.(googleapis|gstatic)[^>]*>/gi)) keep.push(m[0]);
for (const m of head.matchAll(/<style[\s\S]*?<\/style>/gi)) keep.push(m[0]);
const scripts = [...head.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0]);

const out = [...keep, body.trim(), ...scripts].join('\n');
writeFileSync('dist/stasia-page.html', out);
console.log(`dist/stasia-page.html: ${(out.length / 1024).toFixed(1)} kB`);
