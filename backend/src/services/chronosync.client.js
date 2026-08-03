/**
 * Client for ChronoSync's payroll data (payroll_runs / payroll_run_items), reached
 * through the same read endpoints CFIE itself is built on: GET /payroll/runs and
 * GET /payroll/runs/:id/items.
 *
 * ChronoBooks does NOT write into ChronoSync's gl_journal_batches / gl_journal_lines —
 * that's CFIE's ledger. Instead it reads a posted run's totals and mirrors them as one
 * balanced entry in its own ledger (see payroll.controller.js). This keeps the two
 * systems decoupled: ChronoBooks never needs write access to ChronoSync's GL tables,
 * and never risks the two ledgers disagreeing about who owns which entry.
 *
 * Set CHRONOSYNC_API_URL (and CHRONOSYNC_API_TOKEN) to point this at a real ChronoSync
 * instance. Unset, it falls back to one realistic mock payroll run — same pattern as
 * db.js falling back to SQLite — so Payroll is demoable without a live ChronoSync
 * connection. The totals below are deliberately balanced (gross = net + PAYE + employee
 * SSNIT + employee Tier2) exactly like a real payroll run would be.
 */

const BASE_URL = process.env.CHRONOSYNC_API_URL;
const API_TOKEN = process.env.CHRONOSYNC_API_TOKEN;

/**
 * Built fresh against the real current month rather than a fixed date -- a hardcoded
 * "2026-07" run would quietly go stale (and stop showing up in "this month's" dashboard
 * KPIs) the moment wall-clock time moved into August, which is exactly the kind of thing
 * that makes a demo look broken for no product reason. The totals are deliberately
 * balanced (gross = net + PAYE + employee SSNIT + employee Tier2), same as a real run.
 */
function buildMockRun() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    id: `mock-run-${year}-${String(month).padStart(2, '0')}`,
    period_year: year,
    period_month: month,
    status: 'calculated',
    employee_count: 5,
    total_gross: 50000,
    total_net: 39250,
    total_paye: 8000,
    total_ssnit_ee: 2750,
    total_ssnit_er: 6500,
    total_tier2_ee: 0,
    total_tier2_er: 2500,
  };
}

async function chronosyncFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`ChronoSync API error ${res.status} on ${path}`);
  return res.json();
}

async function listPayrollRuns() {
  if (!BASE_URL) return [buildMockRun()];
  return chronosyncFetch('/payroll/runs');
}

async function getPayrollRun(runId) {
  const runs = await listPayrollRuns();
  const run = runs.find((r) => String(r.id) === String(runId));
  if (!run) throw new Error(`Payroll run ${runId} not found in ChronoSync.`);
  return run;
}

module.exports = { listPayrollRuns, getPayrollRun, isMocked: () => !BASE_URL };
