import { useState } from 'react';
import { COLORS } from '../theme.js';

// Small "add a league by ID" control. onLookup(id) validates + selects (throws on bad league).
export default function AddLeague({ onLookup }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    const clean = id.trim();
    if (!clean || busy) return;
    setBusy(true); setErr(null);
    try { await onLookup(clean); setId(''); setOpen(false); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const inputStyle = { padding: '6px 9px', borderRadius: 6, border: `1px solid ${COLORS.panelBorder}`, background: 'rgba(0,0,0,0.3)', color: COLORS.text, fontSize: 13 };

  return (
    <div style={{ marginTop: 6 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 12, cursor: 'pointer', padding: 0 }}>
          ＋ Add a league by ID
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            autoFocus value={id} onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
            placeholder="Sleeper league ID" style={{ ...inputStyle, width: 200 }}
          />
          <button onClick={submit} disabled={busy} style={{ ...inputStyle, cursor: 'pointer', border: `1px solid ${COLORS.gold}`, color: COLORS.gold, background: 'rgba(212,169,78,0.12)' }}>
            {busy ? 'Looking up…' : 'Look up'}
          </button>
          <button onClick={() => { setOpen(false); setErr(null); }} style={{ background: 'none', border: 'none', color: COLORS.faint, fontSize: 12, cursor: 'pointer' }}>cancel</button>
          {err && <div style={{ flexBasis: '100%', color: COLORS.over, fontSize: 12 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
