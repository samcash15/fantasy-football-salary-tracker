import { useMemo, useState } from 'react';
import { COLORS, POS_COLORS } from '../theme.js';

// Where overrides.json lives, for the one-click "edit on GitHub" link.
const OVERRIDES_EDIT_URL = 'https://github.com/samcash15/fantasy-football-salary-tracker/edit/main/overrides.json';

const inputStyle = {
  padding: '7px 9px', borderRadius: 6, border: `1px solid ${COLORS.panelBorder}`,
  background: 'rgba(0,0,0,0.25)', color: COLORS.text, fontSize: 13,
};

// The commissioner panel is a *helper*, not a live writer: the static site can't write to the repo,
// so it builds the overrides.json for you and links you to commit it on GitHub. The next compute
// run applies it. `players` = rostered players (name/value) to pick from; `overrides` = current file.
export default function CommishPanel({ players, overrides }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState(() => (overrides?.overrides ?? []).map((o) => ({ sleeper_id: String(o.sleeper_id), amount: o.amount, note: o.note ?? '' })));
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const byId = useMemo(() => new Map(players.map((p) => [p.sleeper_id, p])), [players]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [players, query]);

  const upsert = (sleeper_id, amount, note) => {
    setEdits((prev) => {
      const next = prev.filter((e) => e.sleeper_id !== sleeper_id);
      next.push({ sleeper_id, amount: Number(amount), note });
      return next.sort((a, b) => (byId.get(b.sleeper_id)?.value ?? 0) - (byId.get(a.sleeper_id)?.value ?? 0));
    });
  };
  const remove = (sleeper_id) => setEdits((prev) => prev.filter((e) => e.sleeper_id !== sleeper_id));

  const json = JSON.stringify({ overrides: edits.map((e) => ({ sleeper_id: e.sleeper_id, amount: e.amount, ...(e.note ? { note: e.note } : {}) })) }, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px 40px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', color: COLORS.faint, fontSize: 12, cursor: 'pointer', padding: '6px 0', letterSpacing: '0.04em' }}
      >
        ⚙ {open ? 'Hide commissioner tools' : 'Commissioner tools'}
      </button>

      {open && (
        <div style={{ border: `1px solid ${COLORS.panelBorder}`, borderRadius: 10, padding: 16, marginTop: 6, background: COLORS.panel }}>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Overrides force a player's value (winning over the computed running-max). This panel builds the file —
            to save, copy the JSON below and commit it to <code>overrides.json</code> on GitHub. The next refresh applies it.
          </div>

          {/* add / update an override */}
          <div style={{ marginBottom: 8, fontSize: 12, letterSpacing: '0.06em', color: COLORS.faint }}>ADD / UPDATE OVERRIDE</div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a rostered player…" style={{ ...inputStyle, width: '100%', maxWidth: 340 }} />
          {results.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.hairline}`, borderRadius: 6, marginTop: 6, maxWidth: 340, overflow: 'hidden' }}>
              {results.map((p) => (
                <PickRow key={p.sleeper_id} p={p} onPick={() => { upsert(p.sleeper_id, p.value, ''); setQuery(''); }} />
              ))}
            </div>
          )}

          {/* working list of overrides */}
          <div style={{ margin: '16px 0 8px', fontSize: 12, letterSpacing: '0.06em', color: COLORS.faint }}>
            OVERRIDES ({edits.length})
          </div>
          {edits.length === 0 && <div style={{ fontSize: 13, color: COLORS.faint }}>None yet — search above to add one.</div>}
          {edits.map((e) => {
            const p = byId.get(e.sleeper_id);
            return (
              <div key={e.sleeper_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${COLORS.hairline}`, flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 150px', fontSize: 14 }}>
                  {p ? p.name : `#${e.sleeper_id}`}
                  <span style={{ fontSize: 11, color: COLORS.faint }}>{p ? ` · ${p.position}${p.team ? ' · ' + p.team : ''} · was $${p.value}` : ` · id ${e.sleeper_id}`}</span>
                </span>
                <span style={{ color: COLORS.faint, fontSize: 12 }}>$</span>
                <input type="number" value={e.amount} onChange={(ev) => upsert(e.sleeper_id, ev.target.value, e.note)} className="num" style={{ ...inputStyle, width: 70, color: COLORS.gold }} />
                <input value={e.note} onChange={(ev) => upsert(e.sleeper_id, e.amount, ev.target.value)} placeholder="note (optional)" style={{ ...inputStyle, flex: '1 1 140px' }} />
                <button onClick={() => remove(e.sleeper_id)} aria-label="Remove" style={{ background: 'none', border: 'none', color: COLORS.faint, cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            );
          })}

          {/* output */}
          <div style={{ margin: '18px 0 6px', fontSize: 12, letterSpacing: '0.06em', color: COLORS.faint }}>overrides.json</div>
          <textarea readOnly value={json} rows={Math.min(14, 4 + edits.length * 2)} style={{ ...inputStyle, width: '100%', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={copy} style={{ ...inputStyle, cursor: 'pointer', border: `1px solid ${COLORS.gold}`, color: COLORS.gold, background: 'rgba(212,169,78,0.12)' }}>
              {copied ? 'Copied ✓' : 'Copy JSON'}
            </button>
            <a href={OVERRIDES_EDIT_URL} target="_blank" rel="noreferrer" style={{ ...inputStyle, cursor: 'pointer', textDecoration: 'none', color: COLORS.text }}>
              Edit overrides.json on GitHub →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function PickRow({ p, onPick }) {
  return (
    <button onClick={onPick} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${COLORS.hairline}`, color: COLORS.text, cursor: 'pointer', fontSize: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: POS_COLORS[p.position] || COLORS.muted }} />
      <span style={{ flex: 1 }}>{p.name}</span>
      <span style={{ fontSize: 11, color: COLORS.faint }}>{p.position}{p.team ? ` · ${p.team}` : ''} · ${p.value}</span>
    </button>
  );
}
