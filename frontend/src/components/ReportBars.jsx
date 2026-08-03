const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

/**
 * Two big horizontal bars side by side, scaled to the same axis — used to make
 * "Income vs Expenses" and "Assets vs Liabilities + Equity" readable at a glance
 * instead of requiring the reader to subtract two numbers in their head.
 */
export function ComparisonBar({ leftLabel, leftValue, leftColor, rightLabel, rightValue, rightColor }) {
  const max = Math.max(1, leftValue, rightValue);
  const rows = [
    { label: leftLabel, value: leftValue, color: leftColor },
    { label: rightLabel, value: rightValue, color: rightColor },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: 'var(--cb-text-secondary)' }}>{r.label}</span>
            <span style={{ fontWeight: 700 }}>{currency(r.value)}</span>
          </div>
          <div style={{ height: 14, borderRadius: 7, background: 'var(--cb-bg)', overflow: 'hidden' }}>
            <div
              className="cb-grow-bar-x"
              style={{
                height: '100%',
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                borderRadius: 7,
                background: r.color,
                transformOrigin: 'left',
                animationDuration: '0.7s',
                animationDelay: `${i * 90}ms`,
                animationFillMode: 'both',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Ranked horizontal bars for a set of {label, amount} rows — e.g. expenses by
 * category. Bars are relative to the largest row in the set, so the biggest
 * driver is immediately obvious without reading every number.
 */
export function BreakdownBars({ rows = [], color = 'var(--cb-primary-400)' }) {
  const sorted = [...rows].filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  if (sorted.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>Nothing to break down for this period.</div>;
  }
  const max = Math.max(...sorted.map((r) => r.amount), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {sorted.map((r, i) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span>{r.label}</span>
            <span style={{ color: 'var(--cb-text-secondary)' }}>{currency(r.amount)}</span>
          </div>
          <div style={{ height: 9, borderRadius: 5, background: 'var(--cb-bg)', overflow: 'hidden' }}>
            <div
              className="cb-grow-bar-x"
              style={{
                height: '100%',
                width: `${Math.max(3, (r.amount / max) * 100)}%`,
                borderRadius: 5,
                background: color,
                transformOrigin: 'left',
                animationDuration: '0.6s',
                animationDelay: `${i * 60}ms`,
                animationFillMode: 'both',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
