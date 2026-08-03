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

## What's intentionally stubbed

Sales, Purchases, Banking, Accounting, Reports, and Settings have nav entries and
placeholder pages but no backend yet — they're the next slices, and they'll all reuse
`journal.service.js` the same way Expenses does.

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

`npm run verify` runs an automated smoke test (login → dashboard → record expense →
confirm the balance moved correctly) against an in-process server, no separate process
needed.

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to the backend on :4000
```

## Next slices, in order

1. Sales & Invoicing (Debit Accounts Receivable / Credit Sales)
2. Banking — deposits, transfers, basic reconciliation
3. Purchases & Supplier Bills (Debit Expense-or-Asset / Credit Accounts Payable)
4. Reports — Profit & Loss, Balance Sheet, Trial Balance (pure queries over
   `journal_lines`, no new data model needed)
5. Payroll integration from ChronoSync
6. Settings — company profile, user roles, the branding preset picker from Section 3.6
