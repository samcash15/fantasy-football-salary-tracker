import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Minus, DollarSign, Shield, X, AlertCircle } from 'lucide-react';

const CAP = 500;

const SEED_PLAYERS = [
  { id: 'p1', name: 'Josh Allen', pos: 'QB', team: 'BUF', salary: 62 },
  { id: 'p2', name: 'Patrick Mahomes', pos: 'QB', team: 'KC', salary: 58 },
  { id: 'p3', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', salary: 71 },
  { id: 'p4', name: 'Tyreek Hill', pos: 'WR', team: 'MIA', salary: 68 },
  { id: 'p5', name: 'Justin Jefferson', pos: 'WR', team: 'MIN', salary: 74 },
  { id: 'p6', name: 'Christian McCaffrey', pos: 'RB', team: 'SF', salary: 79 },
  { id: 'p7', name: 'Bijan Robinson', pos: 'RB', team: 'ATL', salary: 55 },
  { id: 'p8', name: 'Breece Hall', pos: 'RB', team: 'NYJ', salary: 49 },
  { id: 'p9', name: 'Travis Kelce', pos: 'TE', team: 'KC', salary: 41 },
  { id: 'p10', name: 'Sam LaPorta', pos: 'TE', team: 'DET', salary: 33 },
  { id: 'p11', name: 'Amon-Ra St. Brown', pos: 'WR', team: 'DET', salary: 63 },
  { id: 'p12', name: 'Jahmyr Gibbs', pos: 'RB', team: 'DET', salary: 51 },
  { id: 'p13', name: 'Lamar Jackson', pos: 'QB', team: 'BAL', salary: 57 },
  { id: 'p14', name: 'A.J. Brown', pos: 'WR', team: 'PHI', salary: 60 },
  { id: 'p15', name: 'Puka Nacua', pos: 'WR', team: 'LAR', salary: 47 },
  { id: 'p16', name: 'De\'Von Achane', pos: 'RB', team: 'MIA', salary: 44 },
  { id: 'p17', name: 'Mark Andrews', pos: 'TE', team: 'BAL', salary: 24 },
  { id: 'p18', name: 'Nico Collins', pos: 'WR', team: 'HOU', salary: 39 },
  { id: 'p19', name: 'Kyren Williams', pos: 'RB', team: 'LAR', salary: 36 },
  { id: 'p20', name: 'Justin Herbert', pos: 'QB', team: 'LAC', salary: 34 },
];

const POS_COLORS = {
  QB: '#D4A94E',
  RB: '#7FA37A',
  WR: '#5B9BD5',
  TE: '#C97B5E',
  DST: '#9B8AC4',
  K: '#B0A99F',
};

function usePersisted(key, initial, shared) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(key, shared);
        if (!cancelled && res) setValue(JSON.parse(res.value));
      } catch (e) {
        // key doesn't exist yet — keep initial
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key, shared]);

  const persist = useCallback(async (next) => {
    setValue(next);
    try {
      await window.storage.set(key, JSON.stringify(next), shared);
    } catch (e) {
      console.error('storage set failed', e);
    }
  }, [key, shared]);

  return [value, persist, loaded];
}

export default function DraftBoard() {
  const [players, setPlayers, playersLoaded] = usePersisted('players-v1', SEED_PLAYERS, true);
  const [roster, setRoster, rosterLoaded] = usePersisted('my-roster-v1', [], false);
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [adminOpen, setAdminOpen] = useState(false);
  const [form, setForm] = useState({ name: '', pos: 'RB', team: '', salary: '' });
  const [seeded, setSeeded] = useState(false);

  // Seed shared storage once if empty (only after load confirms nothing was there)
  useEffect(() => {
    if (playersLoaded && !seeded) {
      setSeeded(true);
      if (!players || players.length === 0) setPlayers(SEED_PLAYERS);
    }
  }, [playersLoaded, seeded, players, setPlayers]);

  const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DST', 'K'];

  const filtered = useMemo(() => {
    return (players || [])
      .filter(p => posFilter === 'ALL' || p.pos === posFilter)
      .filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.team.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.salary - a.salary);
  }, [players, posFilter, query]);

  const rosterPlayers = useMemo(() => {
    return (roster || []).map(id => (players || []).find(p => p.id === id)).filter(Boolean);
  }, [roster, players]);

  const spent = rosterPlayers.reduce((sum, p) => sum + p.salary, 0);
  const remaining = CAP - spent;
  const capPct = Math.min(100, (spent / CAP) * 100);
  const overCap = remaining < 0;

  const toggleRoster = (id) => {
    const inRoster = roster.includes(id);
    if (inRoster) {
      setRoster(roster.filter(r => r !== id));
    } else {
      setRoster([...roster, id]);
    }
  };

  const addPlayer = async () => {
    if (!form.name.trim() || !form.salary) return;
    const newPlayer = {
      id: 'p' + Date.now(),
      name: form.name.trim(),
      pos: form.pos,
      team: form.team.trim().toUpperCase() || '—',
      salary: Number(form.salary),
    };
    await setPlayers([...(players || []), newPlayer]);
    setForm({ name: '', pos: 'RB', team: '', salary: '' });
  };

  const updateSalary = async (id, salary) => {
    const next = (players || []).map(p => p.id === id ? { ...p, salary: Number(salary) || 0 } : p);
    await setPlayers(next);
  };

  const removePlayer = async (id) => {
    await setPlayers((players || []).filter(p => p.id !== id));
    if (roster.includes(id)) setRoster(roster.filter(r => r !== id));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#16302A', color: '#F2EFE9', fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        .field-lines {
          background-image: repeating-linear-gradient(
            90deg,
            rgba(242,239,233,0.035) 0px,
            rgba(242,239,233,0.035) 1px,
            transparent 1px,
            transparent 64px
          );
        }
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .display { font-family: 'Bebas Neue', 'IBM Plex Sans', sans-serif; letter-spacing: 0.02em; }
        ::selection { background: #D4A94E; color: #16302A; }
        input:focus, button:focus-visible { outline: 2px solid #D4A94E; outline-offset: 2px; }
        .row:hover { background: rgba(242,239,233,0.05); }
      `}</style>

      <div className="field-lines" style={{ borderBottom: '1px solid rgba(242,239,233,0.15)', padding: '24px 20px 20px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h1 className="display" style={{ fontSize: 42, margin: 0, color: '#F2EFE9', lineHeight: 1 }}>
              THE DRAFT BOARD
            </h1>
            <span className="num" style={{ fontSize: 13, color: '#B0A99F' }}>SALARY CAP LEAGUE · ${CAP} CAP</span>
          </div>

          {/* Cap gauge — signature element */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="num" style={{ fontSize: 13, color: '#B0A99F', letterSpacing: '0.05em' }}>MY CAP SPACE</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 600, color: overCap ? '#E07856' : '#D4A94E' }}>
                {overCap ? `-$${Math.abs(remaining)} OVER` : `$${remaining} LEFT`}
              </span>
            </div>
            <div style={{ position: 'relative', height: 14, background: 'rgba(0,0,0,0.35)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(242,239,233,0.15)' }}>
              <div style={{
                width: `${capPct}%`,
                height: '100%',
                background: overCap ? 'linear-gradient(90deg, #E07856, #C0553B)' : 'linear-gradient(90deg, #7FA37A, #D4A94E)',
                transition: 'width 0.3s ease',
              }} />
              {[20, 40, 60, 80].map(mark => (
                <div key={mark} style={{ position: 'absolute', left: `${mark}%`, top: 0, bottom: 0, width: 1, background: 'rgba(22,48,42,0.5)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span className="num" style={{ fontSize: 11, color: '#7C8A82' }}>$0</span>
              <span className="num" style={{ fontSize: 11, color: '#7C8A82' }}>{rosterPlayers.length} PLAYERS DRAFTED</span>
              <span className="num" style={{ fontSize: 11, color: '#7C8A82' }}>${CAP}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px' }}>

        {/* My Roster */}
        {rosterPlayers.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: '#B0A99F', marginBottom: 8 }}>MY ROSTER</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rosterPlayers.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(242,239,233,0.06)', border: '1px solid rgba(242,239,233,0.15)',
                  borderRadius: 6, padding: '6px 10px',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: POS_COLORS[p.pos] || '#B0A99F' }} />
                  <span style={{ fontSize: 14 }}>{p.name}</span>
                  <span className="num" style={{ fontSize: 13, color: '#D4A94E' }}>${p.salary}</span>
                  <button onClick={() => toggleRoster(p.id)} aria-label={`Remove ${p.name}`}
                    style={{ background: 'none', border: 'none', color: '#B0A99F', cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7C8A82' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search player or team..."
              style={{
                width: '100%', padding: '9px 10px 9px 34px', borderRadius: 6,
                border: '1px solid rgba(242,239,233,0.2)', background: 'rgba(0,0,0,0.25)',
                color: '#F2EFE9', fontSize: 14,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {positions.map(pos => (
              <button key={pos} onClick={() => setPosFilter(pos)}
                style={{
                  padding: '8px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  border: '1px solid ' + (posFilter === pos ? '#D4A94E' : 'rgba(242,239,233,0.2)'),
                  background: posFilter === pos ? 'rgba(212,169,78,0.15)' : 'transparent',
                  color: posFilter === pos ? '#D4A94E' : '#B0A99F',
                }}>
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Player list */}
        <div style={{ border: '1px solid rgba(242,239,233,0.12)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 60px 70px 40px',
            padding: '8px 12px', fontSize: 11, letterSpacing: '0.06em', color: '#7C8A82',
            borderBottom: '1px solid rgba(242,239,233,0.12)', background: 'rgba(0,0,0,0.15)',
          }}>
            <span>PLAYER</span><span>POS</span><span>TEAM</span><span style={{ textAlign: 'right' }}>VALUE</span><span></span>
          </div>
          {!playersLoaded || !rosterLoaded ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#7C8A82', fontSize: 13 }}>Loading roster data...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#7C8A82', fontSize: 13 }}>No players match that search.</div>
          ) : filtered.map(p => {
            const inRoster = roster.includes(p.id);
            return (
              <div key={p.id} className="row" style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 60px 70px 40px', alignItems: 'center',
                padding: '10px 12px', fontSize: 14, borderBottom: '1px solid rgba(242,239,233,0.06)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: POS_COLORS[p.pos] || '#B0A99F', flexShrink: 0 }} />
                  {p.name}
                </span>
                <span style={{ fontSize: 12, color: '#B0A99F' }}>{p.pos}</span>
                <span style={{ fontSize: 12, color: '#B0A99F' }}>{p.team}</span>
                <span className="num" style={{ textAlign: 'right', color: '#D4A94E' }}>${p.salary}</span>
                <button onClick={() => toggleRoster(p.id)}
                  aria-label={inRoster ? `Remove ${p.name} from roster` : `Add ${p.name} to roster`}
                  style={{
                    justifySelf: 'end', width: 26, height: 26, borderRadius: 5, cursor: 'pointer',
                    border: '1px solid ' + (inRoster ? '#E07856' : 'rgba(242,239,233,0.25)'),
                    background: inRoster ? 'rgba(224,120,86,0.15)' : 'transparent',
                    color: inRoster ? '#E07856' : '#7FA37A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {inRoster ? <Minus size={14} /> : <Plus size={14} />}
                </button>
              </div>
            );
          })}
        </div>

        {overCap && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, padding: '10px 12px', background: 'rgba(224,120,86,0.12)', border: '1px solid rgba(224,120,86,0.3)', borderRadius: 6, color: '#E07856', fontSize: 13 }}>
            <AlertCircle size={16} /> You're over the ${CAP} cap. Drop a player before draft day.
          </div>
        )}

        {/* Commissioner / admin panel */}
        <div style={{ marginTop: 28, borderTop: '1px solid rgba(242,239,233,0.12)', paddingTop: 16 }}>
          <button onClick={() => setAdminOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              color: '#B0A99F', fontSize: 13, cursor: 'pointer', padding: 0,
            }}>
            <Shield size={14} /> {adminOpen ? 'Hide commissioner tools' : 'Commissioner tools (edit values)'}
          </button>

          {adminOpen && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#7C8A82', marginBottom: 10 }}>
                Player values are shared — changes here are visible to everyone using this app.
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <input placeholder="Player name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ flex: '1 1 160px', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(242,239,233,0.2)', background: 'rgba(0,0,0,0.25)', color: '#F2EFE9', fontSize: 13 }} />
                <select value={form.pos} onChange={e => setForm({ ...form, pos: e.target.value })}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(242,239,233,0.2)', background: 'rgba(0,0,0,0.25)', color: '#F2EFE9', fontSize: 13 }}>
                  {positions.filter(p => p !== 'ALL').map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
                <input placeholder="Team" value={form.team} onChange={e => setForm({ ...form, team: e.target.value })}
                  style={{ width: 70, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(242,239,233,0.2)', background: 'rgba(0,0,0,0.25)', color: '#F2EFE9', fontSize: 13 }} />
                <input placeholder="$" type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })}
                  style={{ width: 70, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(242,239,233,0.2)', background: 'rgba(0,0,0,0.25)', color: '#F2EFE9', fontSize: 13 }} />
                <button onClick={addPlayer}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #D4A94E', background: 'rgba(212,169,78,0.15)', color: '#D4A94E', fontSize: 13, cursor: 'pointer' }}>
                  Add player
                </button>
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(242,239,233,0.12)', borderRadius: 8 }}>
                {(players || []).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid rgba(242,239,233,0.06)', fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{p.name} <span style={{ color: '#7C8A82' }}>({p.pos} · {p.team})</span></span>
                    <span style={{ color: '#7C8A82' }}>$</span>
                    <input type="number" value={p.salary} onChange={e => updateSalary(p.id, e.target.value)}
                      className="num" style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(242,239,233,0.2)', background: 'rgba(0,0,0,0.25)', color: '#D4A94E' }} />
                    <button onClick={() => removePlayer(p.id)} aria-label={`Delete ${p.name}`}
                      style={{ background: 'none', border: 'none', color: '#7C8A82', cursor: 'pointer', display: 'flex' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, fontSize: 12, color: '#5F6D65', textAlign: 'center' }}>
          Player values sync for everyone. Your roster picks are yours alone.
        </div>
      </div>
    </div>
  );
}
