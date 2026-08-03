import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Payroll() {
  const [runs, setRuns] = useState([]);
  const [imports, setImports] = useState([]);
  const [mocked, setMocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(null);

  function load() {
    api.listAvailablePayrollRuns().then((r) => { setRuns(r.runs); setMocked(r.mocked); }).catch((err) => setError(err.message));
    api.listPayrollImports().then((r) => setImports(r.imports)).catch(() => {});
  }

  useEffect(load, []);

  async function handleImport(runId) {
    setError('');
    setNotice('');
    setImporting(runId);
    try {
      const result = await api.importPayrollRun(runId);
      if (result.pendingApproval) setNotice(result.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(null);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Payroll</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 4 }}>
        Payroll itself runs in ChronoSync. ChronoBooks mirrors a posted run as one balanced journal entry — Salary Expense,
        employer SSNIT/Tier2 costs, and every statutory payable, posted automatically.
      </p>
      {mocked && (
        <p style={{ fontSize: 12, color: 'var(--cb-amber-600, #854f0b)', marginTop: 0, marginBottom: 16 }}>
          CHRONOSYNC_API_URL isn't set, so this is showing one realistic mock payroll run instead of a live ChronoSync
          connection — point that env var at a real ChronoSync instance to replace it.
        </p>
      )}

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--cb-amber-600)', fontSize: 13, marginBottom: 12, background: '#faeeda', borderRadius: 8, padding: '8px 10px', maxWidth: 760 }}>⏳ {notice}</div>}

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, marginBottom: 20, maxWidth: 760 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Available payroll runs</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Period</th>
              <th style={thStyle}>Employees</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Gross</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                <td style={tdStyle}>{MONTHS[r.period_month]} {r.period_year}</td>
                <td style={tdStyle}>{r.employee_count}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(r.total_gross)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(r.total_net)}</td>
                <td style={tdStyle}>
                  {r.imported ? (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#e1f5ee', color: '#085041' }}>imported</span>
                  ) : (
                    <button type="button" onClick={() => handleImport(r.id)} disabled={importing === r.id} style={buttonStyle}>
                      {importing === r.id ? 'Importing…' : 'Import to ChronoBooks'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No payroll runs available.</div>}
      </div>

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, maxWidth: 760 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Import history</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Period</th>
              <th style={thStyle}>Employees</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Gross</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
              <th style={thStyle}>Imported</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((i) => (
              <tr key={i.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                <td style={tdStyle}>{MONTHS[i.period_month]} {i.period_year}</td>
                <td style={tdStyle}>{i.employee_count}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(i.total_gross)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(i.total_net)}</td>
                <td style={tdStyle}>{String(i.imported_at).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {imports.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>Nothing imported yet.</div>}
      </div>
    </div>
  );
}

const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
const buttonStyle = { padding: '6px 10px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 12 };
