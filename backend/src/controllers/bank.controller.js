const crypto = require('crypto');
const db = require('../config/db');
const {
  postJournalEntry,
  postDepositCashJournal,
  postWithdrawCashJournal,
  postBankTransferJournal,
  postBankChargeJournal,
  postInterestEarnedJournal,
} = require('../services/journal.service');

async function balanceForAccount(companyId, accountId) {
  const res = await db.query(
    `SELECT COALESCE(SUM(jl.debit),0) as debit, COALESCE(SUM(jl.credit),0) as credit
     FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.company_id = $1 AND jl.account_id = $2`,
    [companyId, accountId]
  );
  return Number(res.rows[0].debit) - Number(res.rows[0].credit);
}

async function nextBankAccountCode(companyId) {
  const res = await db.query(`SELECT code FROM accounts WHERE company_id = $1 AND group_name = 'Bank Accounts' ORDER BY code DESC LIMIT 1`, [companyId]);
  const lastCode = res.rows[0]?.code;
  const next = lastCode ? Number(lastCode) + 1 : 1010;
  return String(next);
}

async function listBankAccounts(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT b.id, b.name, b.bank_name, b.branch, b.account_number, b.currency, b.swift_code, b.iban,
            b.mobile_money_wallet, b.is_default, b.account_id, a.code
     FROM bank_accounts b JOIN accounts a ON a.id = b.account_id
     WHERE b.company_id = $1 ORDER BY b.is_default DESC, b.name`,
    [companyId]
  );
  const withBalances = await Promise.all(
    result.rows.map(async (row) => ({ ...row, isDefault: !!row.is_default, balance: await balanceForAccount(companyId, row.account_id) }))
  );
  res.json({ bankAccounts: withBalances });
}

async function createBankAccount(req, res) {
  const { companyId, sub: userId } = req.user;
  const { name, bankName, branch, accountNumber, currency, swiftCode, iban, mobileMoneyWallet, openingBalance, isDefault } = req.body;
  if (!name) return res.status(400).json({ error: 'Account name is required.' });

  const code = await nextBankAccountCode(companyId);
  const accountRes = await db.query(
    `INSERT INTO accounts (company_id, code, name, type, group_name) VALUES ($1,$2,$3,'asset','Bank Accounts') RETURNING id`,
    [companyId, code, name]
  );
  const accountId = accountRes.rows[0].id;

  if (isDefault) {
    await db.query(`UPDATE bank_accounts SET is_default = false WHERE company_id = $1`, [companyId]);
  }

  const bankAccountId = crypto.randomUUID();
  await db.query(
    `INSERT INTO bank_accounts (id, company_id, account_id, name, bank_name, branch, account_number, currency, swift_code, iban, mobile_money_wallet, opening_balance, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      bankAccountId, companyId, accountId, name, bankName || null, branch || null, accountNumber || null,
      currency || 'GHS', swiftCode || null, iban || null, mobileMoneyWallet || null,
      Number(openingBalance || 0), isDefault ? '1' : '0',
    ]
  );

  if (Number(openingBalance) > 0) {
    const capitalRes = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND code = '3000' LIMIT 1`, [companyId]);
    await postJournalEntry({
      companyId,
      entryDate: new Date().toISOString().slice(0, 10),
      reference: 'OPENING',
      description: `Opening balance for ${name}`,
      sourceType: 'opening_balance',
      sourceId: bankAccountId,
      createdBy: userId,
      lines: [
        { accountId, debit: Number(openingBalance), credit: 0 },
        { accountId: capitalRes.rows[0].id, debit: 0, credit: Number(openingBalance) },
      ],
    });
  }

  res.status(201).json({ id: bankAccountId, accountId, code });
}

/** PUT /bank-accounts/:id — rename a bank/mobile-money account. Keeps the linked Chart of
 * Accounts entry's name in sync so the ledger and reports show the same label. */
async function updateBankAccount(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Account name is required.' });

  const bank = await getBankAccountRow(companyId, id);
  if (!bank) return res.status(404).json({ error: 'Bank account not found.' });

  const trimmed = name.trim();
  await db.query(`UPDATE bank_accounts SET name = $1 WHERE id = $2 AND company_id = $3`, [trimmed, id, companyId]);
  await db.query(`UPDATE accounts SET name = $1 WHERE id = $2 AND company_id = $3`, [trimmed, bank.account_id, companyId]);

  res.json({ ok: true });
}

async function getCashAccountId(companyId) {
  const res = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Cash' LIMIT 1`, [companyId]);
  return res.rows[0]?.id;
}
async function getBankAccountRow(companyId, bankAccountId) {
  const res = await db.query(`SELECT * FROM bank_accounts WHERE id = $1 AND company_id = $2`, [bankAccountId, companyId]);
  return res.rows[0];
}

/** Deposit Cash (spec Section 7): Debit Bank, Credit Cash. */
async function deposit(req, res) {
  const { companyId, sub: userId } = req.user;
  const { bankAccountId, amount, date, reference, description } = req.body;
  if (!bankAccountId || !amount || !date) return res.status(400).json({ error: 'Bank account, amount, and date are required.' });

  const bank = await getBankAccountRow(companyId, bankAccountId);
  if (!bank) return res.status(404).json({ error: 'Bank account not found.' });
  const cashAccountId = await getCashAccountId(companyId);

  const journalEntryId = await postDepositCashJournal({
    companyId, bankAccountId: bank.account_id, cashAccountId, amount: Number(amount),
    depositDate: date, reference, description: description || `Deposit to ${bank.name}`, createdBy: userId, sourceId: null,
  });
  res.status(201).json({ journalEntryId });
}

/** Withdraw Cash (spec Section 7): Debit Cash, Credit Bank. */
async function withdraw(req, res) {
  const { companyId, sub: userId } = req.user;
  const { bankAccountId, amount, date, reference, description } = req.body;
  if (!bankAccountId || !amount || !date) return res.status(400).json({ error: 'Bank account, amount, and date are required.' });

  const bank = await getBankAccountRow(companyId, bankAccountId);
  if (!bank) return res.status(404).json({ error: 'Bank account not found.' });
  const cashAccountId = await getCashAccountId(companyId);

  const journalEntryId = await postWithdrawCashJournal({
    companyId, bankAccountId: bank.account_id, cashAccountId, amount: Number(amount),
    withdrawDate: date, reference, description: description || `Withdrawal from ${bank.name}`, createdBy: userId, sourceId: null,
  });
  res.status(201).json({ journalEntryId });
}

/** Transfer Between Banks (spec Section 7): Debit Destination Bank, Credit Source Bank. */
async function transfer(req, res) {
  const { companyId, sub: userId } = req.user;
  const { fromBankAccountId, toBankAccountId, amount, date, reference, description } = req.body;
  if (!fromBankAccountId || !toBankAccountId || !amount || !date) {
    return res.status(400).json({ error: 'Source account, destination account, amount, and date are required.' });
  }
  if (fromBankAccountId === toBankAccountId) return res.status(400).json({ error: 'Source and destination must be different accounts.' });

  const from = await getBankAccountRow(companyId, fromBankAccountId);
  const to = await getBankAccountRow(companyId, toBankAccountId);
  if (!from || !to) return res.status(404).json({ error: 'Bank account not found.' });

  const journalEntryId = await postBankTransferJournal({
    companyId, fromAccountId: from.account_id, toAccountId: to.account_id, amount: Number(amount),
    transferDate: date, reference, description: description || `Transfer: ${from.name} to ${to.name}`, createdBy: userId, sourceId: null,
  });
  res.status(201).json({ journalEntryId });
}

/** Bank Charges (spec Section 7): Debit Bank Charges expense, Credit Bank. */
async function charge(req, res) {
  const { companyId, sub: userId } = req.user;
  const { bankAccountId, amount, date, reference, description } = req.body;
  if (!bankAccountId || !amount || !date) return res.status(400).json({ error: 'Bank account, amount, and date are required.' });

  const bank = await getBankAccountRow(companyId, bankAccountId);
  if (!bank) return res.status(404).json({ error: 'Bank account not found.' });
  const chargesRes = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Bank Charges' LIMIT 1`, [companyId]);

  const journalEntryId = await postBankChargeJournal({
    companyId, bankAccountId: bank.account_id, bankChargesAccountId: chargesRes.rows[0].id, amount: Number(amount),
    chargeDate: date, reference, description: description || `Bank charge on ${bank.name}`, createdBy: userId, sourceId: null,
  });
  res.status(201).json({ journalEntryId });
}

/** Interest Earned (spec Section 7): Debit Bank, Credit Interest Income. */
async function interest(req, res) {
  const { companyId, sub: userId } = req.user;
  const { bankAccountId, amount, date, reference, description } = req.body;
  if (!bankAccountId || !amount || !date) return res.status(400).json({ error: 'Bank account, amount, and date are required.' });

  const bank = await getBankAccountRow(companyId, bankAccountId);
  if (!bank) return res.status(404).json({ error: 'Bank account not found.' });
  const incomeRes = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Interest Income' LIMIT 1`, [companyId]);

  const journalEntryId = await postInterestEarnedJournal({
    companyId, bankAccountId: bank.account_id, interestIncomeAccountId: incomeRes.rows[0].id, amount: Number(amount),
    earnedDate: date, reference, description: description || `Interest earned on ${bank.name}`, createdBy: userId, sourceId: null,
  });
  res.status(201).json({ journalEntryId });
}

async function listTransactions(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT je.id, je.entry_date, je.description, je.source_type, je.voided_at, je.reversal_of,
            (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE journal_entry_id = je.id) as total
     FROM journal_entries je
     WHERE je.company_id = $1 AND je.source_type IN ('deposit','withdrawal','transfer','bank_charge','interest')
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT 20`,
    [companyId]
  );
  res.json({ transactions: result.rows });
}

module.exports = { listBankAccounts, createBankAccount, updateBankAccount, deposit, withdraw, transfer, charge, interest, listTransactions };
