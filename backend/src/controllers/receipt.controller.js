const crypto = require('crypto');
const db = require('../config/db');
const { postReceiptJournal } = require('../services/journal.service');
const { httpError, isApprovalRequired, createApprovalRequest } = require('../services/approval.service');

/**
 * Receive Customer Payment (spec Section 7): pick the invoice and where the money
 * landed. Debit Bank/Cash / Credit Accounts Receivable is posted automatically, and
 * the invoice's paid/status fields update so "outstanding customers" on the dashboard
 * reflects it immediately. Pulled out of the HTTP handler so the Approval Workflow can
 * call this exact same logic once a pending request is approved.
 */
async function buildReceipt(companyId, userId, body) {
  const { invoiceId, receiptDate, depositedToAccountCode, amount, paymentMethod, reference } = body;

  if (!invoiceId || !receiptDate || !depositedToAccountCode || !amount) {
    throw httpError(400, 'Invoice, date, deposit account, and amount are required.');
  }

  const invoiceRes = await db.query(`SELECT * FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, companyId]);
  const invoice = invoiceRes.rows[0];
  if (!invoice) throw httpError(404, 'Invoice not found.');

  const outstanding = Number(invoice.total) - Number(invoice.paid);
  if (Number(amount) > outstanding + 0.01) {
    throw httpError(400, `Amount exceeds outstanding balance of ${outstanding.toFixed(2)}.`);
  }

  const receivableRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Accounts Receivable' LIMIT 1`,
    [companyId]
  );
  const receivableAccount = receivableRes.rows[0];

  const depositRes = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND code = $2 LIMIT 1`, [companyId, depositedToAccountCode]);
  const depositAccount = depositRes.rows[0];
  if (!depositAccount) throw httpError(400, `Unknown deposit account: ${depositedToAccountCode}`);

  const receiptId = crypto.randomUUID();

  const journalEntryId = await postReceiptJournal({
    companyId,
    depositedToAccountId: depositAccount.id,
    receivableAccountId: receivableAccount.id,
    amount: Number(amount),
    receiptDate,
    reference: reference || invoice.invoice_number,
    description: `Receipt for ${invoice.invoice_number}`,
    createdBy: userId,
    sourceId: receiptId,
  });

  await db.query(
    `INSERT INTO receipts (id, company_id, invoice_id, receipt_date, deposited_to_account_id, amount, payment_method, reference, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [receiptId, companyId, invoiceId, receiptDate, depositAccount.id, Number(amount), paymentMethod || null, reference || null, journalEntryId, userId]
  );

  const newPaid = Number(invoice.paid) + Number(amount);
  const newStatus = newPaid >= Number(invoice.total) - 0.01 ? 'paid' : 'partially_paid';
  await db.query(`UPDATE invoices SET paid = $1, status = $2 WHERE id = $3`, [newPaid, newStatus, invoiceId]);

  return { receiptId, journalEntryId, invoiceStatus: newStatus };
}

async function describeReceiptRequest(companyId, body) {
  const { invoiceId, amount } = body;
  const invoiceRes = invoiceId ? await db.query(`SELECT invoice_number FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, companyId]) : { rows: [] };
  const invoiceNumber = invoiceRes.rows[0]?.invoice_number || 'an unknown invoice';
  return { description: `Receipt against ${invoiceNumber}`, amount: Number(amount || 0) };
}

async function createReceipt(req, res) {
  const { companyId, sub: userId } = req.user;
  const { invoiceId, receiptDate, depositedToAccountCode, amount } = req.body;

  if (!invoiceId || !receiptDate || !depositedToAccountCode || !amount) {
    return res.status(400).json({ error: 'Invoice, date, deposit account, and amount are required.' });
  }

  const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];

  if (isApprovalRequired(company, 'receipt')) {
    // Validate up front so a bad request never even reaches the approval queue.
    const invoiceRes = await db.query(`SELECT * FROM invoices WHERE id = $1 AND company_id = $2`, [invoiceId, companyId]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const outstanding = Number(invoice.total) - Number(invoice.paid);
    if (Number(amount) > outstanding + 0.01) return res.status(400).json({ error: `Amount exceeds outstanding balance of ${outstanding.toFixed(2)}.` });

    const { description } = await describeReceiptRequest(companyId, req.body);
    const request = await createApprovalRequest({ companyId, userId, module: 'receipt', payload: req.body, description, amount: Number(amount), currency: company.currency });
    return res.status(202).json({ pendingApproval: true, approvalRequestId: request.id, message: 'Submitted for approval — the receipt will be recorded once approved.' });
  }

  const result = await buildReceipt(companyId, userId, req.body);
  res.status(201).json(result);
}

module.exports = { createReceipt, buildReceipt, describeReceiptRequest };
