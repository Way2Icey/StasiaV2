// One tab for what the Archon remembers: its annals, our legacy, and the renown of its people.
import { useNav } from './context';
import type { Route } from './router';

export function AnnalsNav({ at }: { at: 'history' | 'legacy' | 'renown' }) {
  const nav = useNav();
  const go: [typeof at, string, Route][] = [['history', 'Annals of the Archon', { kind: 'history' }], ['legacy', 'Our legacy', { kind: 'legacy' }], ['renown', 'Renown', { kind: 'people', view: 'renown' }]];
  return (
    <div className="filters" style={{ marginBottom: 12 }}>
      {go.map(([k, label, to]) => <button key={k} type="button" className="pill" aria-pressed={at === k} onClick={() => nav.to(to)}>{label}</button>)}
    </div>
  );
}
