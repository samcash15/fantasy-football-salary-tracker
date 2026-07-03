import { COLORS } from '../theme.js';

// Per-team cap gauge — repurposed from the prototype's single "my cap space" bar.
export default function CapGauge({ spent, cap, over }) {
  const pct = Math.min(100, (spent / cap) * 100);
  return (
    <div>
      <div
        style={{
          position: 'relative', height: 12, background: 'rgba(0,0,0,0.35)',
          borderRadius: 3, overflow: 'hidden', border: `1px solid ${COLORS.panelBorder}`,
        }}
      >
        <div
          style={{
            width: `${pct}%`, height: '100%',
            background: over
              ? 'linear-gradient(90deg, #E07856, #C0553B)'
              : 'linear-gradient(90deg, #7FA37A, #D4A94E)',
            transition: 'width 0.3s ease',
          }}
        />
        {[25, 50, 75].map((m) => (
          <div
            key={m}
            style={{ position: 'absolute', left: `${m}%`, top: 0, bottom: 0, width: 1, background: 'rgba(22,48,42,0.5)' }}
          />
        ))}
      </div>
    </div>
  );
}
