const crypto = require('crypto');
const db = require('../config/db');
const { postJournalEntry } = require('../services/journal.service');

/** Chart of accounts with each account's current balance — the same numbers Reports uses. */
async function listAccounts(req, res) {
  const { companyId } = req.user;
  const accountsRes = await db.query(
    `SELECT id, code, name, type, group_name FROM accounts WHERE company_id = $1 ORDER BY code`,
    [companyId]
  );
  const balancesRes = await db.query(
    `SELECT jl.account_id, COALESCE(SUM(jl.debit),0) as debit, COALESCE(SUM(jl.credit),0) as credit
     FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.company_id = $1 GROUP BY jl.account_id`,
    [companyId]
  );
  const balanceMap = Object.fromEntries(balancesRes.rows.map((r) => [r.account_id, Number(r.debit) - Number(r.credit)]));

  res.json({
    accounts: accountsRes.rows.map((a) => ({ ...a, balance: balanceMap[a.id] || 0 })),
  });
}

/** Every journal line posted to one account, oldest first, with a running balance. */
async function getLedger(req, res) {
  const { companyId } = req.user;
  const { accountId } = req.params;

  const accountRes = await db.query(`SELECT * FROM accounts WHERE id = $1 AND company_id = $2`, [accountId, companyId]);
  const account = accountRes.rows[0];
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  const linesRes = await db.query(
    `SELECT jl.id, jl.debit, jl.credit, je.entry_date, je.description, je.reference, je.source_type
     FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.account_id = $1 AND je.company_id = $2
     ORDER BY je.entry_date ASC, je.created_at ASC`,
    [accountId, companyId]
  );

  let running = 0;
  const lines = linesRes.rows.map((l) => {
    running += Number(l.debit) - Number(l.credit);
    return { ...l, runningBalance: running };
  });

  res.json({ account, lines, closingBalance: running });
}

/** Every journal entry across every module, most recent first. */
async function listJournalEntries(req, res) {
  const { companyId } = req.user;
  const entriesRes = await db.query(
    `SELECT je.id, je.entry_date, je.reference, je.description, je.source_type, je.created_at,
            (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE journal_entry_id = je.id) as total
     FROM journal_entries je
     WHERE je.company_id = $1
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT 100`,
    [companyId]
  );
  res.json({ entries: entriesRes.rows });
}

async function getJournalEntryLines(req, res) {
  const { companyId } = req.user;
  const { entryId } = req.params;
  const entryRes = await db.query(`SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2`, [entryId, companyId]);
  if (!entryRes.rows[0]) return res.status(404).json({ error: 'Journal entry not found.' });

  const linesRes = await db.query(
    `SELECT jl.debit, jl.credit, a.code, a.name
     FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
     WHERE jl.journal_entry_id = $1 ORDER BY jl.debit DESC`,
    [entryId]
  );
  res.json({ entry: entryRes.rows[0], lines: linesRes.rows });
}

/**
 * Manual Journal Entry — the escape hatch for anything the smart auto-journal flows
 * don't cover (corrections, adjustments, opening entries for something new). Unlike
 * every other posting path in ChronoBooks, the user picks accounts directly here, so
 * it's gated to Administrator/Accountant and the lines must balance before it's
 * accepted (postJournalEntry throws otherwise).
 */
async function createJournalEntry(req, res) {
  const { companyId, sub: userId } = req.user;
  const { entryDate, reference, description, lines } = req.body;

  if (!entryDate || !Array.isArray(lines) || lines.length < 2) {
    return res.status(400).json({ error: 'Date and at least two lines are required.' });
  }
  const normalizedLines = lines.map((l) => ({ accountId: Number(l.accountId), debit: Number(l.debit || 0), credit: Number(l.credit || 0) }));

  const journalEntryId = await postJournalEntry({
    companyId,
    entryDate,
    reference,
    description,
    sourceType: 'manual',
    sourceId: null,
    createdBy: userId,
    lines: normalizedLines,
  });

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'create','journal_entry',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, journalEntryId, JSON.stringify({ description, lineCount: lines.length })]
  );

  res.status(201).json({ journalEntryId });
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

/**
 * Chart of Accounts is auto-created at company setup (seed.js), but the write-up is
 * explicit that "users can edit or extend this later" — so unlike every other posting
 * path (which only ever create accounts implicitly, e.g. a new bank account), this
 * lets an Administrator/Accountant add or rename accounts directly.
 */
async function createAccount(req, res) {
  const { companyId } = req.user;
  const { code, name, type, groupName } = req.body;
  if (!code || !name || !type || !groupName) {
    return res.status(400).json({ error: 'Code, name, type, and group are required.' });
  }
  if (!ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${ACCOUNT_TYPES.join(', ')}.` });
  }

  const existing = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND code = $2`, [companyId, code]);
  if (existing.rows[0]) return res.status(409).json({ error: `Account code ${code} already exists.` });

  const result = await db.query(
    `INSERT INTO accounts (company_id, code, name, type, group_name, is_system) VALUES ($1,$2,$3,$4,$5,0) RETURNING id`,
    [companyId, code, name, type, groupName]
  );
  res.status(201).json({ id: result.rows[0].id, code, name, type, groupName });
}

/** Rename an account or move it to a different group. Code and type are fixed once created — too much else keys off them. */
async function updateAccount(req, res) {
  const { companyId } = req.user;
  const { accountId } = req.params;
  const { name, groupName } = req.body;

  const existing = await db.query(`SELECT * FROM accounts WHERE id = $1 AND company_id = $2`, [accountId, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Account not found.' });

  await db.query(`UPDATE accounts SET name = $1, group_name = $2 WHERE id = $3`, [
    name || existing.rows[0].name,
    groupName || existing.rows[0].group_name,
    accountId,
  ]);
  res.json({ ok: true });
}

module.exports = {
  listAccounts, getLedger, listJournalEntries, getJournalEntryLines, createJournalEntry,
  createAccount, updateAccount,
};
