import { useState } from 'react';
import { GLOSSARY, GLOSSARY_GROUPS } from '../data/glossary';
import { Panel } from './links';

export function GlossaryPage() {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const entries = Object.entries(GLOSSARY).filter(([, g]) => !needle || g.term.toLowerCase().includes(needle) || g.text.toLowerCase().includes(needle));
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>Glossary</h2>
          <p>Every underlined word in the game shows its meaning when you hover or tap it. They are all collected here.</p>
        </div>
      </div>
      <div className="filters">
        <label htmlFor="glossary-q" className="sr-only">Find a term</label>
        <input id="glossary-q" className="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a term…" style={{ width: 260, maxWidth: '100%' }} />
      </div>
      <div className="grid">
        {GLOSSARY_GROUPS.map((group) => {
          const items = entries.filter(([, g]) => g.group === group);
          if (!items.length) return null;
          return (
            <Panel key={group} title={group} className="span-6 glossary-group">
              <div className="body">
                <dl>
                  {items.map(([k, g]) => <div key={k} style={{ display: 'contents' }}><dt>{g.term}</dt><dd>{g.text}</dd></div>)}
                </dl>
              </div>
            </Panel>
          );
        })}
        {entries.length === 0 ? <p className="muted span-12">Nothing matches.</p> : null}
      </div>
    </>
  );
}
