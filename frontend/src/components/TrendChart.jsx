const MONTH_LABELS = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function monthLabel(ym) {
  const m = (ym || '').split('-')[1];
  return MONTH_LABELS[m] || ym;
}

// Hand-rolled grouped bar chart, no chart library — income vs expense per month,
// straight off the ledger (dashboard.service.js's monthlyTrend). Bars grow in on
// mount via the cb-grow-bar keyframe, staggered per month for a bit of life.
export default function TrendChart({ data = [] }) {
  const rows = data.length ? data : [{ month: '', income: 0, expense: 0 }];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  const chartHeight = 140;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: chartHeight + 34, padding: '0 4px' }}>
      {rows.map((r, i) => {
        const incomeH = Math.max(2, (r.income / max) * chartHeight);
        const expenseH = Math.max(2, (r.expense / max) * chartHeight);
        return (
          <div key={r.month || i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: chartHeight }}>
              <div
                title={`Income: ${r.income.toLocaleString()}`}
                className="cb-grow-bar"
                style={{
                  width: 12,
                  height: incomeH,
                  borderRadius: '4px 4px 0 0',
                  background: 'linear-gradient(180deg, var(--cb-success), #0f6e56)',
                  transformOrigin: 'bottom',
                  animationDuration: '0.6s',
                  animationDelay: `${i * 70}ms`,
                  animationFillMode: 'both',
                }}
              />
              <div
                title={`Expenses: ${r.expense.toLocaleString()}`}
                className="cb-grow-bar"
                style={{
                  width: 12,
                  height: expenseH,
                  borderRadius: '4px 4px 0 0',
                  background: 'linear-gradient(180deg, var(--cb-amber-400), var(--cb-amber-600))',
                  transformOrigin: 'bottom',
                  animationDuration: '0.6s',
                  animationDelay: `${i * 70 + 90}ms`,
                  animationFillMode: 'both',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{monthLabel(r.month)}</div>
          </div>
        );
      })}
    </div>
  );
}
