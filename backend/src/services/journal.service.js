const crypto = require('crypto');
const db = require('../config/db');

/**
 * The core smart feature from the ChronoBooks spec (Section 7): the user records a
 * business event in plain language, and this service builds the balanced double-entry
 * journal behind the scenes. The user never sees "debit" or "credit".
 *
 * Every posting function here follows the same shape: look up the accounts involved,
 * write one journal_entries row, write two (or more) balanced journal_lines rows.
 */

async function postJournalEntry({ companyId, entryDate, reference, description, sourceType, sourceId, createdBy, lines }) {
  const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw Object.assign(new Error(`Journal entry is not balanced: debit ${totalDebit} vs credit ${totalCredit}`), { status: 400 });
  }

  const entryId = crypto.randomUUID();
  await db.query(
    `INSERT INTO journal_entries (id, company_id, entry_date, reference, description, source_type, source_id, created_by, posted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
    [entryId, companyId, entryDate, reference || null, description || null, sourceType, sourceId || null, createdBy || null]
  );

  for (const line of lines) {
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit)
       VALUES ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), entryId, line.accountId, line.debit || 0, line.credit || 0]
    );
  }

  return entryId;
}

/** Record Expense -> Debit Expense, Credit Bank/Cash */
async function postExpenseJournal({ companyId, expenseAccountId, paidFromAccountId, amount, tax, expenseDate, reference, description, createdBy, sourceId }) {
  const total = Number(amount) + Number(tax || 0);
  return postJournalEntry({
    companyId,
    entryDate: expenseDate,
    reference,
    description,
    sourceType: 'expense',
    sourceId,
    createdBy,
    lines: [
      { accountId: expenseAccountId, debit: total, credit: 0 },
      { accountId: paidFromAccountId, debit: 0, credit: total },
    ],
  });
}

/** Raise Customer Invoice -> Debit Accounts Receivable, Credit Sales/Service Income (+ VAT Payable if tax) */
async function postInvoiceJournal({ companyId, receivableAccountId, incomeAccountId, vatAccountId, subtotal, tax, invoiceDate, reference, description, createdBy, sourceId }) {
  const total = Number(subtotal) + Number(tax || 0);
  const lines = [
    { accountId: receivableAccountId, debit: total, credit: 0 },
    { accountId: incomeAccountId, debit: 0, credit: Number(subtotal) },
  ];
  if (Number(tax) > 0 && vatAccountId) {
    lines.push({ accountId: vatAccountId, debit: 0, credit: Number(tax) });
  }
  return postJournalEntry({
    companyId,
    entryDate: invoiceDate,
    reference,
    description,
    sourceType: 'invoice',
    sourceId,
    createdBy,
    lines,
  });
}

/** Receive Customer Payment -> Debit Bank/Cash, Credit Accounts Receivable */
async function postReceiptJournal({ companyId, depositedToAccountId, receivableAccountId, amount, receiptDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId,
    entryDate: receiptDate,
    reference,
    description,
    sourceType: 'receipt',
    sourceId,
    createdBy,
    lines: [
      { accountId: depositedToAccountId, debit: Number(amount), credit: 0 },
      { accountId: receivableAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/**
 * Record Supplier Bill -> Debit Expense-or-Asset, Credit Accounts Payable.
 * Tax is lumped into the expense line for V1, same simplification as postExpenseJournal —
 * a dedicated input-VAT account arrives with the Sales/Purchases Tax phase (roadmap).
 */
async function postBillJournal({ companyId, expenseAccountId, payableAccountId, subtotal, tax, billDate, reference, description, createdBy, sourceId }) {
  const lines = [
    { accountId: expenseAccountId, debit: Number(subtotal) + Number(tax || 0), credit: 0 },
    { accountId: payableAccountId, debit: 0, credit: Number(subtotal) + Number(tax || 0) },
  ];
  return postJournalEntry({
    companyId,
    entryDate: billDate,
    reference,
    description,
    sourceType: 'bill',
    sourceId,
    createdBy,
    lines,
  });
}

/** Pay Supplier -> Debit Accounts Payable, Credit Bank/Cash */
async function postSupplierPaymentJournal({ companyId, paidFromAccountId, payableAccountId, amount, paymentDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId,
    entryDate: paymentDate,
    reference,
    description,
    sourceType: 'supplier_payment',
    sourceId,
    createdBy,
    lines: [
      { accountId: payableAccountId, debit: Number(amount), credit: 0 },
      { accountId: paidFromAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/** Deposit Cash -> Debit Bank, Credit Cash */
async function postDepositCashJournal({ companyId, bankAccountId, cashAccountId, amount, depositDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId, entryDate: depositDate, reference, description, sourceType: 'deposit', sourceId, createdBy,
    lines: [
      { accountId: bankAccountId, debit: Number(amount), credit: 0 },
      { accountId: cashAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/** Withdraw Cash -> Debit Cash, Credit Bank */
async function postWithdrawCashJournal({ companyId, bankAccountId, cashAccountId, amount, withdrawDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId, entryDate: withdrawDate, reference, description, sourceType: 'withdrawal', sourceId, createdBy,
    lines: [
      { accountId: cashAccountId, debit: Number(amount), credit: 0 },
      { accountId: bankAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/** Transfer Between Banks -> Debit Destination Bank, Credit Source Bank */
async function postBankTransferJournal({ companyId, fromAccountId, toAccountId, amount, transferDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId, entryDate: transferDate, reference, description, sourceType: 'transfer', sourceId, createdBy,
    lines: [
      { accountId: toAccountId, debit: Number(amount), credit: 0 },
      { accountId: fromAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/** Bank Charges -> Debit Bank Charges (expense), Credit Bank */
async function postBankChargeJournal({ companyId, bankAccountId, bankChargesAccountId, amount, chargeDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId, entryDate: chargeDate, reference, description, sourceType: 'bank_charge', sourceId, createdBy,
    lines: [
      { accountId: bankChargesAccountId, debit: Number(amount), credit: 0 },
      { accountId: bankAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/** Interest Earned -> Debit Bank, Credit Interest Income */
async function postInterestEarnedJournal({ companyId, bankAccountId, interestIncomeAccountId, amount, earnedDate, reference, description, createdBy, sourceId }) {
  return postJournalEntry({
    companyId, entryDate: earnedDate, reference, description, sourceType: 'interest', sourceId, createdBy,
    lines: [
      { accountId: bankAccountId, debit: Number(amount), credit: 0 },
      { accountId: interestIncomeAccountId, debit: 0, credit: Number(amount) },
    ],
  });
}

/**
 * Run Payroll (spec Section 7) — mirrors a posted ChronoSync/CFIE payroll run as one
 * balanced entry. Matches CFIE's own nine source types one-for-one:
 *   Debit  Salary Expense (gross), SSNIT Employer Expense, Tier2 Employer Expense
 *   Credit PAYE Payable, SSNIT Employee Payable, SSNIT Employer Payable,
 *          Tier2 Employee Payable, Tier2 Employer Payable, Net Salaries Payable
 * Employer contributions appear on both sides deliberately — they're a real expense
 * to the company (debit) that the company now owes to SSNIT/Tier2 (credit), same
 * amount, so they don't unbalance the entry. Zero-amount lines are skipped so the
 * ledger stays clean when a category doesn't apply.
 */
async function postPayrollJournal({ companyId, accounts, totals, payrollDate, reference, description, createdBy, sourceId }) {
  const candidateLines = [
    { accountId: accounts.salaryExpense, debit: totals.gross, credit: 0 },
    { accountId: accounts.ssnitErExpense, debit: totals.ssnitEr, credit: 0 },
    { accountId: accounts.tier2ErExpense, debit: totals.tier2Er, credit: 0 },
    { accountId: accounts.payePayable, debit: 0, credit: totals.paye },
    { accountId: accounts.ssnitEePayable, debit: 0, credit: totals.ssnitEe },
    { accountId: accounts.ssnitErPayable, debit: 0, credit: totals.ssnitEr },
    { accountId: accounts.tier2EePayable, debit: 0, credit: totals.tier2Ee },
    { accountId: accounts.tier2ErPayable, debit: 0, credit: totals.tier2Er },
    { accountId: accounts.netSalariesPayable, debit: 0, credit: totals.net },
  ];
  const lines = candidateLines.filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0);

  return postJournalEntry({
    companyId, entryDate: payrollDate, reference, description, sourceType: 'payroll', sourceId, createdBy, lines,
  });
}

/**
 * Void/Reverse (accounting-correct undo): posted transactions are never hard-edited or
 * hard-deleted, since that erases the audit trail and can silently unbalance a ledger
 * some other report already summed. Instead this posts an equal-and-opposite entry
 * (every debit becomes a credit and vice versa) and flags the original as voided. The
 * original and its reversal both stay visible in the ledger forever, and they net to
 * zero automatically in every balance/report query -- nothing else has to change to
 * "hide" a voided transaction from totals.
 */
async function reverseJournalEntry({ companyId, originalEntryId, entryDate, reference, description, sourceType, sourceId, createdBy }) {
  const original = await db.query(`SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2`, [originalEntryId, companyId]);
  if (!original.rows[0]) throw Object.assign(new Error('Original journal entry not found.'), { status: 404 });
  if (original.rows[0].voided_at) throw Object.assign(new Error('This entry has already been voided.'), { status: 400 });

  const linesRes = await db.query(`SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`, [originalEntryId]);
  const lines = linesRes.rows.map((l) => ({ accountId: l.account_id, debit: Number(l.credit) || 0, credit: Number(l.debit) || 0 }));

  const reversalEntryId = await postJournalEntry({ companyId, entryDate, reference, description, sourceType, sourceId, createdBy, lines });
  await db.query(`UPDATE journal_entries SET reversal_of = $1 WHERE id = $2`, [originalEntryId, reversalEntryId]);
  await db.query(`UPDATE journal_entries SET voided_at = $1, voided_by = $2 WHERE id = $3`, [
    db.dialect === 'postgres' ? new Date().toISOString() : new Date().toISOString().replace('T', ' ').slice(0, 19),
    createdBy || null,
    originalEntryId,
  ]);

  return reversalEntryId;
}

module.exports = {
  postJournalEntry,
  reverseJournalEntry,
  postExpenseJournal,
  postInvoiceJournal,
  postReceiptJournal,
  postBillJournal,
  postSupplierPaymentJournal,
  postDepositCashJournal,
  postWithdrawCashJournal,
  postBankTransferJournal,
  postBankChargeJournal,
  postInterestEarnedJournal,
  postPayrollJournal,
};
