const crypto = require('crypto');
const db = require('../config/db');
const { postBillJournal } = require('../services/journal.service');
const { httpError, isApprovalRequired, createApprovalRequest } = require('../services/approval.service');
const inventoryService = require('../services/inventory.service');
const currencyService = require('../services/currency.service');
const costCentreService = require('../services/costCentre.service');

async function nextBillNumber(companyId) {
  const res = await db.query(`SELECT COUNT(*) as count FROM bills WHERE company_id = $1`, [companyId]);
  const n = Number(res.rows[0].count) + 1;
  return `BILL-${String(n).padStart(4, '0')}`;
}

async function listBills(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT b.*, s.name as supplier_name, cc.code as cost_centre_code, cc.name as cost_centre_name
     FROM bills b
     JOIN suppliers s ON s.id = b.supplier_id
     LEFT JOIN cost_centres cc ON cc.id = b.cost_centre_id
     WHERE b.company_id = $1
     ORDER BY b.bill_date DESC, b.created_at DESC`,
    [companyId]
  );
  res.json({ bills: result.rows });
}

/**
 * Record Supplier Bill (spec Section 7): the user picks a supplier and what the bill
 * is for — no accounts involved. Debit Expense-or-Asset / Credit Accounts Payable is
 * posted automatically. Pulled out of the HTTP handler so the Approval Workflow can
 * call this exact same logic once a pending request is approved.
 */
async function buildBill(companyId, userId, body) {
  const { supplierId, billDate, dueDate, expenseCategory, lines, taxRatePercent } = body;

  if (!supplierId || !billDate || !Array.isArray(lines) || lines.length === 0) {
    throw httpError(400, 'Supplier, bill date, and at least one line item are required.');
  }

  const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];
  const baseCurrency = company?.currency || 'GHS';

  const costCentreId = await costCentreService.resolveCostCentreId(companyId, body.costCentreId);

  // A line that references an Inventory item is a stock receipt — the bill has to be
  // categorized as "Inventory" so the money side (Debit Inventory / Credit Accounts
  // Payable) matches the stock side (quantity/cost going up on that item).
  const itemLines = lines.filter((l) => l.itemId);
  if (itemLines.length > 0 && (expenseCategory || 'Miscellaneous') !== 'Inventory') {
    throw httpError(400, 'To receive stock on a bill, set the category to "Inventory".');
  }

  const payableRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Accounts Payable' LIMIT 1`,
    [companyId]
  );
  const payableAccount = payableRes.rows[0];
  if (!payableAccount) throw httpError(400, 'No Accounts Payable account configured for this company.');

  const expenseRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = $2 LIMIT 1`,
    [companyId, expenseCategory || 'Miscellaneous']
  );
  const expenseAccount = expenseRes.rows[0];
  if (!expenseAccount) throw httpError(400, `Unknown expense category: ${expenseCategory || 'Miscellaneous'}`);

  // Multi-Currency: convert line amounts (in whatever currency was typed) to the
  // company's base currency before anything posts — see invoice.controller.js's
  // buildInvoice for the identical pattern and rationale.
  const { rate, isForeign } = await currencyService.resolveExchangeRate({
    companyId, currency: body.currency, baseCurrency, transactionDate: billDate, manualRate: body.exchangeRate,
  });
  const { foreignSubtotal, baseSubtotal } = currencyService.convertLinesToBase(lines, rate);
  const subtotal = baseSubtotal;
  const tax = Math.round(subtotal * (Number(taxRatePercent || 0) / 100) * 100) / 100;
  const total = subtotal + tax;
  const foreignTax = isForeign ? Math.round(foreignSubtotal * (Number(taxRatePercent || 0) / 100) * 100) / 100 : 0;
  const foreignTotal = isForeign ? Math.round((foreignSubtotal + foreignTax) * 100) / 100 : null;

  const billId = crypto.randomUUID();
  const billNumber = await nextBillNumber(companyId);

  const journalEntryId = await postBillJournal({
    companyId,
    expenseAccountId: expenseAccount.id,
    payableAccountId: payableAccount.id,
    subtotal,
    tax,
    billDate,
    reference: billNumber,
    description: `Bill ${billNumber}`,
    createdBy: userId,
    sourceId: billId,
  });

  await db.query(
    `INSERT INTO bills (id, company_id, supplier_id, bill_number, bill_date, due_date, expense_account_id, subtotal, tax, total, paid, status, journal_entry_id, created_by, currency, exchange_rate, foreign_total, cost_centre_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,'posted',$11,$12,$13,$14,$15,$16)`,
    [billId, companyId, supplierId, billNumber, billDate, dueDate || null, expenseAccount.id, subtotal, tax, total, journalEntryId, userId, isForeign ? body.currency : null, rate, foreignTotal, costCentreId]
  );

  for (const line of lines) {
    await db.query(
      `INSERT INTO bill_lines (id, bill_id, description, quantity, unit_price, line_total, item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), billId, line.description, Number(line.quantity), Number(line.unitPrice), Number(line.quantity) * Number(line.unitPrice), line.itemId || null]
    );
  }

  // Stock receipt: quantity and weighted-average cost go up on each referenced item.
  // No separate journal entry here — the Debit Inventory / Credit Accounts Payable
  // entry just posted above already covers the financial side of receiving this stock.
  for (const line of itemLines) {
    // Inventory costing always lives in base currency (the average cost this feeds
    // into is used later for base-currency Cost of Goods Sold), so a foreign-currency
    // bill converts each line's unit cost at the same rate as the bill itself.
    await inventoryService.receiveStock({
      companyId, itemId: line.itemId, quantity: Number(line.quantity), unitCost: currencyService.round2(Number(line.unitPrice) * rate),
      movementType: 'purchase', reference: billNumber, sourceType: 'bill', sourceId: billId, journalEntryId: null, createdBy: userId,
    });
  }

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'create','bill',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, billId, JSON.stringify({ total, supplierId })]
  );

  return {
    billId, billNumber, total, journalEntryId,
    ...(isForeign ? { currency: body.currency, exchangeRate: rate, foreignTotal } : {}),
    ...(costCentreId ? { costCentreId } : {}),
  };
}

async function describeBillRequest(companyId, body) {
  const { supplierId, lines } = body;
  const supplierRes = supplierId ? await db.query(`SELECT name FROM suppliers WHERE id = $1 AND company_id = $2`, [supplierId, companyId]) : { rows: [] };
  const supplierName = supplierRes.rows[0]?.name || 'an unknown supplier';
  const subtotal = (lines || []).reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = Math.round(subtotal * (Number(body.taxRatePercent || 0) / 100) * 100) / 100;
  const currencySuffix = body.currency ? ` (${body.currency})` : '';
  return { description: `Bill from ${supplierName}${currencySuffix}`, amount: subtotal + tax };
}

async function createBill(req, res) {
  const { companyId, sub: userId } = req.user;

  if (!req.body.supplierId || !req.body.billDate || !Array.isArray(req.body.lines) || req.body.lines.length === 0) {
    return res.status(400).json({ error: 'Supplier, bill date, and at least one line item are required.' });
  }

  const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];

  if (isApprovalRequired(company, 'purchase_bill')) {
    const { description, amount } = await describeBillRequest(companyId, req.body);
    const request = await createApprovalRequest({ companyId, userId, module: 'purchase_bill', payload: req.body, description, amount, currency: company.currency });
    return res.status(202).json({ pendingApproval: true, approvalRequestId: request.id, message: 'Submitted for approval — the bill will be created once approved.' });
  }

  const result = await buildBill(companyId, userId, req.body);
  res.status(201).json(result);
}

module.exports = { listBills, createBill, buildBill, describeBillRequest };
