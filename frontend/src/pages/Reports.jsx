import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ComparisonBar, BreakdownBars } from '../components/ReportBars';
import { downloadCSV, downloadPDF } from '../utils/export';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const TABS = ['Profit & Loss', 'Balance Sheet', 'Trial Balance', 'Cash Flow', 'Budget vs Actual', 'Cost Centres'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function yearStartISO() {
  return `${new Date().getFullYear()}-01-01`;
}

export default function Reports() {
  const [tab, setTab] = useState('Profit & Loss');
  const [from, setFrom] = useState(yearStartISO());
  const [to, setTo] = useState(todayISO());
  const [pl, setPl] = useState(null);
  const [bs, setBs] = useState(null);
  const [tb, setTb] = useState(null);
  const [bva, setBva] = useState(null);
  const [bvaYear, setBvaYear] = useState(new Date().getFullYear());
  const [bvaMonth, setBvaMonth] = useState(new Date().getMonth() + 1);
  const [cc, setCc] = useState(null);
  const [cf, setCf] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    if (tab === 'Profit & Loss') api.profitAndLoss(from, to).then(setPl).catch((err) => setError(err.message));
    if (tab === 'Balance Sheet') api.balanceSheet(to).then(setBs).catch((err) => setError(err.message));
    if (tab === 'Trial Balance') api.trialBalance(to).then(setTb).catch((err) => setError(err.message));
    if (tab === 'Cash Flow') api.cashFlow(from, to).then(setCf).catch((err) => setError(err.message));
    if (tab === 'Budget vs Actual') api.getBudgetVsActual(bvaYear, bvaMonth).then(setBva).catch((err) => setError(err.message));
    if (tab === 'Cost Centres') api.costCentreBreakdown(from, to).then(setCc).catch((err) => setError(err.message));
  }

  useEffect(load, [tab, bvaYear, bvaMonth]);

  // Builds a { title, subtitle, columns, rows, summary } payload from whichever report is
  // currently on screen, shared by both the CSV and PDF download buttons -- one place that
  // knows how to flatten each report's shape, so a new report only needs one new case here.
  function buildExportPayload() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (tab === 'Profit & Loss' && pl) {
      return {
        title: 'Profit & Loss',
        subtitle: `${from} to ${to}`,
        columns: ['Section', 'Category', 'Amount'],
        rows: [
          ...pl.income.map((r) => ['Income', r.label, currency(r.amount)]),
          ...pl.expenses.map((r) => ['Expenses', r.label, currency(r.amount)]),
        ],
        summary: [`Total income: ${currency(pl.totalIncome)}`, `Total expenses: ${currency(pl.totalExpenses)}`, `Net ${pl.netProfit >= 0 ? 'profit' : 'loss'}: ${currency(pl.netProfit)}`],
      };
    }
    if (tab === 'Balance Sheet' && bs) {
      return {
        title: 'Balance Sheet',
        subtitle: `As of ${to}`,
        columns: ['Section', 'Account', 'Amount'],
        rows: [
          ...bs.assets.map((r) => ['Assets', r.label, currency(r.amount)]),
          ...bs.liabilities.map((r) => ['Liabilities', r.label, currency(r.amount)]),
          ...bs.equity.map((r) => ['Equity', r.label, currency(r.amount)]),
        ],
        summary: [`Total assets: ${currency(bs.totalAssets)}`, `Total liabilities: ${currency(bs.totalLiabilities)}`, `Total equity: ${currency(bs.totalEquity)}`, bs.balanced ? 'Balanced' : 'Not balanced'],
      };
    }
    if (tab === 'Trial Balance' && tb) {
      return {
        title: 'Trial Balance',
        subtitle: `As of ${to}`,
        columns: ['Account', 'Debit', 'Credit'],
        rows: tb.rows.map((r) => [`${r.code} — ${r.name}`, r.debit ? currency(r.debit) : '', r.credit ? currency(r.credit) : '']),
        summary: [`Total debit: ${currency(tb.totalDebit)}`, `Total credit: ${currency(tb.totalCredit)}`, tb.balanced ? 'Balanced' : 'Not balanced'],
      };
    }
    if (tab === 'Cash Flow' && cf) {
      return {
        title: 'Cash Flow',
        subtitle: `${cf.fromDate} to ${cf.toDate}`,
        columns: ['Section', 'Item', 'Amount'],
        rows: [
          ...cf.operating.lines.map((l) => ['Operating', l.label, currency(l.amount)]),
          ...cf.investing.lines.map((l) => ['Investing', l.label, currency(l.amount)]),
          ...cf.financing.lines.map((l) => ['Financing', l.label, currency(l.amount)]),
        ],
        summary: [`Net change in cash: ${currency(cf.netChange)}`, `Opening cash: ${currency(cf.openingCash)}`, `Closing cash: ${currency(cf.closingCash)}`],
      };
    }
    if (tab === 'Budget vs Actual' && bva) {
      return {
        title: 'Budget vs Actual',
        subtitle: `Jan through ${monthNames[bva.throughMonth - 1]} ${bva.year}`,
        columns: ['Section', 'Category', 'Budget', 'Actual', 'Variance'],
        rows: [
          ...bva.income.map((r) => ['Income', r.label, currency(r.budget), currency(r.actual), currency(r.variance)]),
          ...bva.expenses.map((r) => ['Expenses', r.label, currency(r.budget), currency(r.actual), currency(r.variance)]),
        ],
        summary: [`Net planned: ${currency(bva.netBudget)}`, `Net actual: ${currency(bva.netActual)}`],
      };
    }
    if (tab === 'Cost Centres' && cc) {
      return {
        title: 'Cost Centres',
        subtitle: `${from} to ${to}`,
        columns: ['Cost centre', 'Income', 'Expenses', 'Net'],
        rows: [
          ...cc.centres.map((c) => [`${c.code} — ${c.name}`, currency(c.income), currency(c.expenses), currency(c.net)]),
          ['Unassigned', currency(cc.unassigned.income), currency(cc.unassigned.expenses), currency(cc.unassigned.net)],
        ],
        summary: [`Total income: ${currency(cc.totalIncome)}`, `Total expenses: ${currency(cc.totalExpenses)}`, `Total net: ${currency(cc.totalNet)}`],
      };
    }
    return null;
  }

  function handleDownloadReport(format) {
    const payload = buildExportPayload();
    if (!payload) return;
    const filename = `${payload.title.replace(/[^a-z0-9]+/gi, '-')}-${to}`;
    if (format === 'pdf') {
      downloadPDF(`${filename}.pdf`, payload);
    } else {
      downloadCSV(`${filename}.csv`, [
        [payload.title],
        [payload.subtitle],
        [],
        payload.columns,
        ...payload.rows,
        [],
        ...payload.summary.map((s) => [s]),
      ]);
    }
  }

  const canExport = !!buildExportPayload();

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Reports</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Live views over the same ledger every module posts into — nothing here is a separately stored number.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--cb-border)',
              background: tab === t ? 'var(--cb-primary-400)' : 'var(--cb-surface)',
              color: tab === t ? 'var(--cb-primary-900)' : 'var(--cb-text-primary)',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, fontSize: 13 }}>
        {(tab === 'Profit & Loss' || tab === 'Cost Centres' || tab === 'Cash Flow') && (
          <>
            <span style={{ color: 'var(--cb-text-secondary)' }}>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: 'var(--cb-text-secondary)' }}>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </>
        )}
        {(tab === 'Balance Sheet' || tab === 'Trial Balance') && (
          <>
            <span style={{ color: 'var(--cb-text-secondary)' }}>As of</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </>
        )}
        {tab === 'Budget vs Actual' && (
          <>
            <span style={{ color: 'var(--cb-text-secondary)' }}>Year</span>
            <input type="number" value={bvaYear} onChange={(e) => setBvaYear(Number(e.target.value))} style={{ ...inputStyle, width: 80 }} />
            <span style={{ color: 'var(--cb-text-secondary)' }}>Through month</span>
            <select value={bvaMonth} onChange={(e) => setBvaMonth(Number(e.target.value))} style={inputStyle}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </>
        )}
        <button onClick={load} style={buttonStyle}>Run</button>
        <button onClick={() => handleDownloadReport('csv')} disabled={!canExport} style={{ ...ghostButtonStyle, opacity: canExport ? 1 : 0.5 }} title="Download as CSV (opens in Excel)">
          Download CSV
        </button>
        <button onClick={() => handleDownloadReport('pdf')} disabled={!canExport} style={{ ...ghostButtonStyle, opacity: canExport ? 1 : 0.5 }} title="Download as PDF">
          Download PDF
        </button>
      </div>

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {tab === 'Profit & Loss' && pl && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="cb-fade-up" style={cardStyle}>
            <div style={cardTitleStyle}>Income vs expenses</div>
            <ComparisonBar
              leftLabel="Income" leftValue={pl.totalIncome} leftColor="var(--cb-success)"
              rightLabel="Expenses" rightValue={pl.totalExpenses} rightColor="var(--cb-amber-400)"
            />
            <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: pl.netProfit >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>
              {pl.netProfit >= 0 ? '↑' : '↓'} Net {pl.netProfit >= 0 ? 'profit' : 'loss'}: {currency(pl.netProfit)}
            </div>

            <div style={{ marginTop: 22, fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
              Where the money went
            </div>
            <BreakdownBars rows={pl.expenses} color="var(--cb-amber-400)" />
          </div>

          <div style={cardStyle}>
            <Section title="Income">
              {pl.income.map((r) => <Row key={r.label} label={r.label} amount={r.amount} />)}
              {pl.income.length === 0 && <Empty />}
            </Section>
            <TotalRow label="Total income" amount={pl.totalIncome} />
            <Section title="Expenses">
              {pl.expenses.map((r) => <Row key={r.label} label={r.label} amount={r.amount} />)}
              {pl.expenses.length === 0 && <Empty />}
            </Section>
            <TotalRow label="Total expenses" amount={pl.totalExpenses} />
            <TotalRow label="Net profit" amount={pl.netProfit} strong />
          </div>
        </div>
      )}

      {tab === 'Balance Sheet' && bs && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="cb-fade-up" style={cardStyle}>
            <div style={cardTitleStyle}>Assets vs Liabilities + Equity</div>
            <ComparisonBar
              leftLabel="Assets" leftValue={bs.totalAssets} leftColor="var(--cb-primary-400)"
              rightLabel="Liabilities + Equity" rightValue={bs.totalLiabilities + bs.totalEquity} rightColor="var(--cb-primary-800)"
            />
            <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: bs.balanced ? 'var(--cb-success)' : 'var(--cb-danger)' }}>
              {bs.balanced ? '✓ Balanced — the two bars match' : '✗ Not balanced'}
            </div>

            {bs.assets.length > 0 && (
              <>
                <div style={{ marginTop: 22, fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                  Assets by account
                </div>
                <BreakdownBars rows={bs.assets} color="var(--cb-primary-400)" />
              </>
            )}
          </div>

          <div style={cardStyle}>
            <Section title="Assets">
              {bs.assets.map((r) => <Row key={r.label} label={r.label} amount={r.amount} />)}
            </Section>
            <TotalRow label="Total assets" amount={bs.totalAssets} />
            <Section title="Liabilities">
              {bs.liabilities.map((r) => <Row key={r.label} label={r.label} amount={r.amount} />)}
              {bs.liabilities.length === 0 && <Empty />}
            </Section>
            <TotalRow label="Total liabilities" amount={bs.totalLiabilities} />
            <Section title="Equity">
              {bs.equity.map((r) => <Row key={r.label} label={r.label} amount={r.amount} />)}
            </Section>
            <TotalRow label="Total equity" amount={bs.totalEquity} />
            <div style={{ marginTop: 12, fontSize: 12, color: bs.balanced ? 'var(--cb-success)' : 'var(--cb-danger)' }}>
              {bs.balanced ? '✓ Balanced — Assets = Liabilities + Equity' : '✗ Not balanced'}
            </div>
          </div>
        </div>
      )}

      {tab === 'Trial Balance' && tb && (
        <div style={{ ...cardStyle, maxWidth: 560 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                <th style={thStyle}>Account</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Debit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.code} style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>{r.code} — {r.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{r.debit ? currency(r.debit) : ''}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{r.credit ? currency(r.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TotalRow label="Totals" amount={null} customRight={
            <span>{currency(tb.totalDebit)} &nbsp;|&nbsp; {currency(tb.totalCredit)}</span>
          } />
          <div style={{ marginTop: 12, fontSize: 12, color: tb.balanced ? 'var(--cb-success)' : 'var(--cb-danger)' }}>
            {tb.balanced ? '✓ Balanced — debit total equals credit total' : '✗ Not balanced'}
          </div>
        </div>
      )}
      {tab === 'Cash Flow' && cf && (
        <div style={{ ...cardStyle, maxWidth: 640 }}>
          <div style={cardTitleStyle}>Cash flow — {cf.fromDate} to {cf.toDate}</div>
          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>
            How much actual cash moved through your Cash and Bank accounts this period — different from Profit &amp; Loss,
            which counts income and expenses even before the cash has changed hands.
          </div>

          <CashFlowSection title="Operating activities" bucket={cf.operating} />
          <CashFlowSection title="Investing activities" bucket={cf.investing} />
          <CashFlowSection title="Financing activities" bucket={cf.financing} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: '2px solid var(--cb-border)', marginTop: 6, fontWeight: 700 }}>
            <span>Net change in cash</span>
            <span style={{ color: cf.netChange >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>{currency(cf.netChange)}</span>
          </div>
          <Row label="Opening cash" amount={cf.openingCash} />
          <Row label="Closing cash" amount={cf.closingCash} />

          {cf.operating.lines.length === 0 && cf.investing.lines.length === 0 && cf.financing.lines.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 8 }}>No cash movement in this period.</div>
          )}
        </div>
      )}

      {tab === 'Budget vs Actual' && bva && (
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Budget vs Actual — Jan through {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][bva.throughMonth - 1]} {bva.year}</div>
          <BudgetSection title="Income" rows={bva.income} />
          <BudgetTotalRow label="Total income" budget={bva.totalBudgetIncome} actual={bva.totalActualIncome} />
          <BudgetSection title="Expenses" rows={bva.expenses} />
          <BudgetTotalRow label="Total expenses" budget={bva.totalBudgetExpenses} actual={bva.totalActualExpenses} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '10px 0', borderTop: '2px solid var(--cb-border)', marginTop: 8, fontWeight: 700 }}>
            <span>Net profit — planned vs actual</span>
            <span>{currency(bva.netBudget)} planned &nbsp;|&nbsp; {currency(bva.netActual)} actual</span>
          </div>
          {bva.income.length === 0 && bva.expenses.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 8 }}>
              No budget or actuals for this period yet — set some numbers on the Budgets page.
            </div>
          )}
        </div>
      )}

      {tab === 'Cost Centres' && cc && (
        <div style={{ ...cardStyle, maxWidth: 640 }}>
          <div style={cardTitleStyle}>Income and expenses by cost centre</div>
          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>
            Covers Sales invoices, Purchases bills, and Expenses tagged with a cost centre. Anything from those
            three not tagged falls under Unassigned — this view doesn't cover bank interest/charges or manual
            journal entries.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                <th style={thStyle}>Cost centre</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Income</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Expenses</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {cc.centres.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>{c.code} — {c.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(c.income)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(c.expenses)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: c.net >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>{currency(c.net)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                <td style={{ ...tdStyle, color: 'var(--cb-text-secondary)' }}>Unassigned</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(cc.unassigned.income)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(cc.unassigned.expenses)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: cc.unassigned.net >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>{currency(cc.unassigned.net)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: '2px solid var(--cb-border)', marginTop: 6, fontWeight: 700 }}>
            <span>Total</span>
            <span>{currency(cc.totalIncome)} income &nbsp;|&nbsp; {currency(cc.totalExpenses)} expenses &nbsp;|&nbsp; {currency(cc.totalNet)} net</span>
          </div>
          {cc.centres.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 8 }}>
              No cost centres set up yet — add some in Settings → Parameters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetSection({ title, rows }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', gap: 10 }}>
          <span>{r.label}</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: 'var(--cb-text-secondary)' }}>{currency(r.budget)} planned</span>
            <span style={{ fontWeight: 600 }}>{currency(r.actual)} actual</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, minWidth: 70, textAlign: 'center',
              background: r.favorable ? '#e1f5ee' : '#faece7', color: r.favorable ? '#085041' : '#993c1d',
            }}>
              {r.variance >= 0 ? '+' : ''}{currency(r.variance)}
            </span>
          </span>
        </div>
      ))}
      {rows.length === 0 && <Empty />}
    </div>
  );
}
function BudgetTotalRow({ label, budget, actual }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--cb-border)', marginTop: 6, fontWeight: 700 }}>
      <span>{label}</span>
      <span>{currency(budget)} planned &nbsp;|&nbsp; {currency(actual)} actual</span>
    </div>
  );
}

function CashFlowSection({ title, bucket }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        <span>{title}</span>
        <span style={{ color: bucket.total >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>{currency(bucket.total)}</span>
      </div>
      {bucket.lines.map((l, i) => <Row key={i} label={l.label} amount={l.amount} />)}
      {bucket.lines.length === 0 && <Empty />}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, amount }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
      <span>{label}</span>
      <span>{currency(amount)}</span>
    </div>
  );
}
function TotalRow({ label, amount, strong, customRight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--cb-border)', marginTop: 6, fontWeight: strong ? 700 : 600 }}>
      <span>{label}</span>
      <span>{customRight || currency(amount)}</span>
    </div>
  );
}
function Empty() {
  return <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>Nothing in this period.</div>;
}

const inputStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 13 };
const buttonStyle = { padding: '7px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13 };
const ghostButtonStyle = { padding: '7px 14px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontWeight: 600, fontSize: 13 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '6px 8px' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 20 };
const cardTitleStyle = { fontSize: 14, fontWeight: 600, marginBottom: 14 };
