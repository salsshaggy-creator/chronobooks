const crypto = require('crypto');
const db = require('../config/db');
const { postSupplierPaymentJournal } = require('../services/journal.service');

/**
 * Pay Supplier (spec Section 7): pick the bill and which account the money left from.
 * Debit Accounts Payable / Credit Bank-or-Cash is posted automatically, and the bill's
 * paid/status fields update so "outstanding suppliers" on the dashboard reflects it
 * immediately.
 */
async function createSupplierPayment(req, res) {
  const { companyId, sub: userId } = req.user;
  const { billId, paymentDate, paidFromAccountCode, amount, paymentMethod, reference } = req.body;

  if (!billId || !paymentDate || !paidFromAccountCode || !amount) {
    return res.status(400).json({ error: 'Bill, date, paid-from account, and amount are required.' });
  }

  const billRes = await db.query(`SELECT * FROM bills WHERE id = $1 AND company_id = $2`, [billId, companyId]);
  const bill = billRes.rows[0];
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  const outstanding = Number(bill.total) - Number(bill.paid);
  if (Number(amount) > outstanding + 0.01) {
    return res.status(400).json({ error: `Amount exceeds outstanding balance of ${outstanding.toFixed(2)}.` });
  }

  const payableRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Accounts Payable' LIMIT 1`,
    [companyId]
  );
  const payableAccount = payableRes.rows[0];

  const paidFromRes = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND code = $2 LIMIT 1`, [companyId, paidFromAccountCode]);
  const paidFromAccount = paidFromRes.rows[0];
  if (!paidFromAccount) return res.status(400).json({ error: `Unknown paid-from account: ${paidFromAccountCode}` });

  const paymentId = crypto.randomUUID();

  const journalEntryId = await postSupplierPaymentJournal({
    companyId,
    paidFromAccountId: paidFromAccount.id,
    payableAccountId: payableAccount.id,
    amount: Number(amount),
    paymentDate,
    reference: reference || bill.bill_number,
    description: `Payment for ${bill.bill_number}`,
    createdBy: userId,
    sourceId: paymentId,
  });

  await db.query(
    `INSERT INTO supplier_payments (id, company_id, bill_id, payment_date, paid_from_account_id, amount, payment_method, reference, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [paymentId, companyId, billId, paymentDate, paidFromAccount.id, Number(amount), paymentMethod || null, reference || null, journalEntryId, userId]
  );

  const newPaid = Number(bill.paid) + Number(amount);
  const newStatus = newPaid >= Number(bill.total) - 0.01 ? 'paid' : 'partially_paid';
  await db.query(`UPDATE bills SET paid = $1, status = $2 WHERE id = $3`, [newPaid, newStatus, billId]);

  res.status(201).json({ paymentId, journalEntryId, billStatus: newStatus });
}

module.exports = { createSupplierPayment };
