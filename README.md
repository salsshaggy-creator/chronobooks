# ChronoBooks — V1 working scaffold

This is a running first slice of ChronoBooks, built on the same stack as ChronoSync
(Node/Express, PostgreSQL, React + Vite, JWT auth) so it can sit in the same ecosystem
without re-tooling. It proves the core idea from the spec end to end: a user logs in,
records an expense in plain language, and the system posts a balanced double-entry
journal behind the scenes — no debits or credits shown anywhere in the UI.

## What's actually wired up

- JWT login (`POST /api/auth/login`) with bcrypt password hashing and an httpOnly
  refresh-token cookie, matching the ChronoSync auth pattern.
- Dashboard summary endpoint — bank balance, cash on hand, monthly expenses, profit/loss,
  recent transactions — computed live from the ledger, not stored as a cached number.
- Expense recording (`POST /api/expenses`) that automatically posts
  **Debit Expense / Credit Bank** as a balanced `journal_entries` + `journal_lines` pair.
  This is the auto-journal engine described in spec Section 7 — every other module
  (sales, purchases, payroll, banking) plugs into the same `journal.service.js` pattern.
- A seeded chart of accounts grouped the way the spec describes (Section 6), hidden
  from the UI — the frontend only ever talks about "Fuel" or "Main Bank Account", never
  account codes.
- React frontend (Login, Dashboard, Expenses, plus placeholder pages for the rest of the
  V1 module list) styled in the Indigo Ledger palette via CSS variables, so the
  "Organization branding" feature (spec Section 3.6) is a variable swap, not a rebuild.

- Sales & Invoicing: raise a customer invoice (auto-posts **Debit Accounts Receivable /
  Credit Sales**, plus VAT Payable if a tax rate is set), then record a receipt against
  it (auto-posts **Debit Bank / Credit Accounts Receivable**), with partial-payment
  tracking. Outstanding customers and monthly income on the dashboard are both live
  off this.
- Purchases & Supplier Bills: record a supplier bill (auto-posts **Debit
  Expense-or-Asset / Credit Accounts Payable**), then pay it (auto-posts **Debit
  Accounts Payable / Credit Bank**), same partial-payment tracking. Outstanding
  suppliers on the dashboard is live off this, and "expenses this month" is now read
  straight off the ledger (any expense-type account movement), so it automatically
  includes both direct Expenses and Bills without the dashboard needing special-case
  logic per module.

- Reports: Profit & Loss, Balance Sheet, and Trial Balance — all pure read queries over
  `journal_lines`/`accounts`, no cached numbers anywhere. The Balance Sheet includes a
  computed "Current Year Earnings" line (income minus expenses to date) so **Assets
  always equals Liabilities + Equity**, and the Trial Balance's debit and credit
  columns always sum to the same total — both are checked automatically in
  `verify-reports.js`.

Also fixed along the way: the seeded opening bank balance used to be a bare number on
the `bank_accounts` row, which would have made the Trial Balance not sum to zero. It's
now posted as a real journal entry (Debit Bank / Credit Capital) in `seed.js`, matching
spec Section 3.2 — every dollar in the system now has to come from a balanced journal
entry, with no exceptions.

- Settings: company profile (name, TIN, VAT, address, contact, currency, country) and
  a brand accent color picker — nine curated presets (Indigo, Emerald, Coral, Rose,
  Slate, Sky Blue, Forest Green, Amber Gold, Crimson), applied instantly to the whole
  app via CSS variables, no rebuild. Still a fixed list rather than a free hex picker —
  every ramp is pre-checked for text contrast, so there's no way to accidentally pick
  a color that breaks readability (see `frontend/src/theme/presets.js`). Only
  Administrators can save changes; other roles see the form read-only, and the API
  itself rejects the PUT for non-administrators (checked in `verify-settings.js`, not
  just enforced in the UI). Also a read-only Users table.
- Nine brand accent presets instead of three (Indigo, Emerald, Coral, Rose, Slate, Sky
  Blue, Forest Green, Amber Gold, Crimson) — still a fixed, contrast-checked list, not
  a free hex picker, so there's no way to save an unreadable combination.

- Banking: multiple bank accounts (each its own ledger account, added on the fly),
  deposit cash, withdraw cash, transfer between banks, bank charges, and interest
  earned — five more auto-journal event types on top of the five from Expenses/Sales/
  Purchases. `verify-banking.js` adds a second account and runs all five transaction
  types, then checks every account balance individually, the dashboard total, and that
  the Trial Balance still sums to zero afterward.

- Payroll integration: **this one is different from every other module.** ChronoSync
  already has its own GL engine (CFIE — `gl_accounts` / `gl_journal_batches` /
  `gl_journal_lines`), so ChronoBooks does not run payroll or write into CFIE's
  tables. Instead, `chronosync.client.js` reads a posted payroll run (real endpoints:
  `GET /payroll/runs`, `GET /payroll/runs/:id/items`, configurable via
  `CHRONOSYNC_API_URL`/`CHRONOSYNC_API_TOKEN`) and mirrors its totals as **one balanced
  entry** in ChronoBooks' own ledger — matching CFIE's nine payroll categories
  one-for-one (Salary Expense, employer SSNIT/Tier2 expense + payable, employee
  PAYE/SSNIT/Tier2 payable, Net Salaries Payable). A `payroll_imports` table stops the
  same run from being mirrored twice. No `CHRONOSYNC_API_URL` set → falls back to one
  realistic mock run (same fallback pattern as `db.js`), so Payroll is demoable without
  a live ChronoSync connection — see `verify-payroll.js`, which imports the mock run,
  confirms the GHS 59,000 expense breaks out correctly across three accounts, confirms
  a second import attempt is rejected (409), and confirms the Trial Balance still
  balances afterward.

- Accounting: General Ledger (pick any account, see every line ever posted to it with a
  running balance — confirmed to match both the chart-of-accounts balance and the
  dashboard number in `verify-accounting.js`) and Journal Entries (every entry from
  every module, click to expand its lines). Also the one place a user can post a
  **manual** journal entry directly — the escape hatch for corrections and adjustments
  the smart auto-journal flows don't cover. Restricted to Administrator/Accountant,
  and the API rejects an unbalanced manual entry (400) even if the UI's balance check
  is bypassed.

## What's intentionally stubbed

Nothing from the original V1 scope list — every module is now backed by a real API and
a real UI. What's left is Phase 2 territory (see below): bank statement import/true
reconciliation, inventory, fixed assets, full user invite/role management, and a live
`CHRONOSYNC_API_URL` connection in place of Payroll's mock run.

## Database note for this environment

Production targets PostgreSQL (`DATABASE_URL=postgres://...` on Railway, per the
ChronoSync convention of raw SQL migrations — see `backend/migrations/postgres/001_init.sql`).
Local development and this scaffold's verification also run against a SQLite mirror
(`backend/migrations/sqlite/001_init.sql`) via Node's built-in `node:sqlite`, so anyone
can clone this and run it with zero services installed. `backend/src/config/db.js` picks
the driver automatically based on `DATABASE_URL` — application code never branches on it.

## Running it

### Backend

```bash
cd backend
npm install
npm run migrate     # applies the SQLite schema by default
npm run seed         # creates a demo company, chart of accounts, and admin login
npm run dev           # starts on http://localhost:4000
```

Demo login: `admin@demo-sme.com` / `ChronoBooks!123`

To point at real Postgres instead, set `DATABASE_URL=postgres://...` before running
`migrate`/`seed`/`dev` (or put it in a `.env` file — see `.env.example`).

If you already ran `migrate`/`seed` before the Sales or Purchases tables were added,
delete your local `chronobooks.db` (it's just a dev database) and re-run
`npm run migrate && npm run seed` so the new tables get created.

`npm run verify` runs an automated smoke test (login → dashboard → record expense →
confirm the balance moved correctly) against an in-process server, no separate process
needed. `npm run verify:sales` and `npm run verify:purchases` do the same for
invoices/receipts and bills/supplier payments respectively. `npm run verify:reports`
replays all three and checks that Profit & Loss, Balance Sheet, and Trial Balance all
come out numerically correct and the books actually balance. `npm run verify:settings`
confirms an Administrator can update the company profile/brand color and that a
Cashier is actually blocked by the API (403), not just hidden in the UI.

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to the backend on :4000
```

## Next slices, in order

1. ~~Sales & Invoicing (Debit Accounts Receivable / Credit Sales)~~ — done
2. ~~Purchases & Supplier Bills (Debit Expense-or-Asset / Credit Accounts Payable)~~ — done
3. ~~Reports — Profit & Loss, Balance Sheet, Trial Balance~~ — done
4. ~~Banking — deposits, transfers, bank accounts, charges, interest~~ — done
   (statement import and true bank reconciliation still to come, per the Phase 2 roadmap)
5. ~~Payroll integration from ChronoSync~~ — done (mirrors posted CFIE runs; a real
   `CHRONOSYNC_API_URL` swaps out the mock run with zero code changes)
6. ~~Settings — company profile, the branding preset picker from Section 3.6~~ — done
   (user creation/invite flow and full role management still to come)
7. ~~Accounting — General Ledger, Journal Entries, manual journal entry~~ — done

Every module in the original V1 scope list (Section 2) is now built, verified, and
runnable. What's left is genuinely Phase 2 (Section 10 of the spec): bank statement
import and true reconciliation, fixed assets, inventory, purchase orders, petty cash,
full approvals workflow, multi-currency, sales/purchases tax detail, and a live
ChronoSync connection for Payroll.
