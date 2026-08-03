const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('./approval.service');

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function getBankAccount(companyId, bankAccountId) {
  const res = await db.query(`SELECT * FROM bank_accounts WHERE id = $1 AND company_id = $2`, [bankAccountId, companyId]);
  return res.rows[0];
}

/** GL balance for a bank account's linked ledger account, cumulative through asOfDate — the same "as of" pattern report.service.js uses. */
async function bookBalanceAsOf(companyId, glAccountId, asOfDate) {
  const res = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN je.entry_date <= $2 THEN jl.debit ELSE 0 END),0) as debit,
            COALESCE(SUM(CASE WHEN je.entry_date <= $2 THEN jl.credit ELSE 0 END),0) as credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.company_id = $1 AND jl.account_id = $3`,
    [companyId, asOfDate, glAccountId]
  );
  return round2(Number(res.rows[0].debit) - Number(res.rows[0].credit));
}

/**
 * Every ledger entry touching this bank account's GL line, dated on/before asOfDate, that
 * hasn't already been cleared in a prior completed reconciliation for this specific bank
 * account. amount is signed: positive = money in (debit), negative = money out (credit).
 */
async function outstandingCandidates(companyId, bankAccountId, glAccountId, asOfDate) {
  const res = await db.query(
    `SELECT je.id, je.entry_date, je.description, je.source_type, je.reference,
            COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as amount
     FROM journal_entries je
     JOIN journal_lines jl ON jl.journal_entry_id = je.id AND jl.account_id = $2
     WHERE je.company_id = $1 AND je.entry_date <= $3
       AND je.id NOT IN (SELECT journal_entry_id FROM reconciled_transactions WHERE bank_account_id = $4)
     GROUP BY je.id, je.entry_date, je.description, je.source_type, je.reference
     ORDER BY je.entry_date ASC, je.id ASC`,
    [companyId, glAccountId, asOfDate, bankAccountId]
  );
  return res.rows.map((r) => ({
    id: r.id, date: r.entry_date, description: r.description, sourceType: r.source_type, reference: r.reference,
    amount: round2(Number(r.amount)),
  }));
}

/**
 * The statement balance this bank account was last reconciled to (0 if it's never been
 * reconciled). Ordered by seq, not created_at — two reconciliations completed within
 * the same second must still resolve to an unambiguous "most recent" one, since the
 * next reconciliation's balancing math depends on it.
 */
async function priorReconciledBalance(companyId, bankAccountId) {
  const res = await db.query(
    `SELECT statement_balance FROM bank_reconciliations
     WHERE company_id = $1 AND bank_account_id = $2
     ORDER BY seq DESC LIMIT 1`,
    [companyId, bankAccountId]
  );
  return res.rows[0] ? Number(res.rows[0].statement_balance) : 0;
}

async function nextSeq(companyId, bankAccountId) {
  const res = await db.query(
    `SELECT COALESCE(MAX(seq),0) + 1 as next FROM bank_reconciliations WHERE company_id = $1 AND bank_account_id = $2`,
    [companyId, bankAccountId]
  );
  return Number(res.rows[0].next);
}

/** What the reconciliation screen shows before anything is saved: book balance + the candidate list to tick through. */
async function getReconciliationState(companyId, bankAccountId, asOfDate) {
  const bank = await getBankAccount(companyId, bankAccountId);
  if (!bank) throw httpError(404, 'Bank account not found.');
  const [bookBalance, candidates, priorBalance] = await Promise.all([
    bookBalanceAsOf(companyId, bank.account_id, asOfDate),
    outstandingCandidates(companyId, bankAccountId, bank.account_id, asOfDate),
    priorReconciledBalance(companyId, bankAccountId),
  ]);
  return { bankAccountId, asOfDate, bookBalance, priorBalance, candidates };
}

/**
 * Completes a reconciliation: the statement's ending balance must exactly equal the
 * balance this account was last reconciled to, plus whatever's newly ticked as cleared
 * this time — i.e. every reconciliation builds on the one before it, the same way a real
 * bank statement's ending balance builds on the previous statement's. No partial/
 * in-progress state is ever persisted, keeping "reconciled" an unambiguous, all-or-
 * nothing fact. Once saved, every cleared entry is locked in via reconciled_transactions
 * and will never be offered again as an outstanding candidate for this bank account.
 */
async function completeReconciliation(companyId, userId, bankAccountId, body) {
  const { statementDate, statementBalance, clearedJournalEntryIds } = body;
  if (!statementDate || statementBalance === undefined || statementBalance === null || !Array.isArray(clearedJournalEntryIds)) {
    throw httpError(400, 'Statement date, statement balance, and the list of cleared transactions are required.');
  }
  const bank = await getBankAccount(companyId, bankAccountId);
  if (!bank) throw httpError(404, 'Bank account not found.');

  const ids = [...new Set(clearedJournalEntryIds)];

  // Re-validate every id against the live candidate list (dated on/before the statement
  // date, not already cleared) so a stale selection from an earlier screen load can never
  // double-clear or clear something dated after the statement.
  const candidates = await outstandingCandidates(companyId, bankAccountId, bank.account_id, statementDate);
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const invalidIds = ids.filter((id) => !candidateById.has(id));
  if (invalidIds.length > 0) {
    throw httpError(400, 'One or more selected transactions can no longer be cleared — they may already be reconciled or dated after the statement date. Refresh and try again.');
  }

  const priorBalance = await priorReconciledBalance(companyId, bankAccountId);
  const clearedTotal = round2(ids.reduce((sum, id) => sum + candidateById.get(id).amount, 0));
  const newReconciledBalance = round2(priorBalance + clearedTotal);
  const difference = round2(Number(statementBalance) - newReconciledBalance);
  if (Math.abs(difference) >= 0.01) {
    throw httpError(400, `Doesn't balance yet — the previous reconciled balance (${priorBalance}) plus what's ticked as cleared (${clearedTotal}) comes to ${newReconciledBalance}, but the statement balance is ${round2(statementBalance)} — a difference of ${difference}. Tick or untick items until the difference is zero.`);
  }

  const bookBalance = await bookBalanceAsOf(companyId, bank.account_id, statementDate);
  const outstandingTotal = round2(bookBalance - newReconciledBalance);

  const seq = await nextSeq(companyId, bankAccountId);
  const reconciliationId = crypto.randomUUID();
  await db.query(
    `INSERT INTO bank_reconciliations (id, company_id, bank_account_id, seq, statement_date, statement_balance, book_balance, cleared_total, outstanding_total, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [reconciliationId, companyId, bankAccountId, seq, statementDate, round2(statementBalance), bookBalance, clearedTotal, outstandingTotal, userId]
  );
  for (const journalEntryId of ids) {
    await db.query(
      `INSERT INTO reconciled_transactions (id, company_id, bank_account_id, journal_entry_id, reconciliation_id) VALUES ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), companyId, bankAccountId, journalEntryId, reconciliationId]
    );
  }

  return {
    reconciliationId, statementDate, statementBalance: round2(statementBalance),
    bookBalance, clearedTotal, outstandingTotal, itemsCleared: ids.length,
  };
}

async function listReconciliations(companyId, bankAccountId) {
  const bank = await getBankAccount(companyId, bankAccountId);
  if (!bank) throw httpError(404, 'Bank account not found.');
  const res = await db.query(
    `SELECT r.*, u.full_name as created_by_name
     FROM bank_reconciliations r
     LEFT JOIN users u ON u.id = r.created_by
     WHERE r.company_id = $1 AND r.bank_account_id = $2
     ORDER BY r.seq DESC`,
    [companyId, bankAccountId]
  );
  return res.rows;
}

module.exports = { getReconciliationState, completeReconciliation, listReconciliations };
