const crypto = require('crypto');
const db = require('../config/db');
const { postInvoiceJournal, postJournalEntry } = require('../services/journal.service');
const { httpError, isApprovalRequired, createApprovalRequest } = require('../services/approval.service');
const inventoryService = require('../services/inventory.service');
const currencyService = require('../services/currency.service');
const costCentreService = require('../services/costCentre.service');

async function nextInvoiceNumber(companyId) {
  const res = await db.query(`SELECT COUNT(*) as count FROM invoices WHERE company_id = $1`, [companyId]);
  const n = Number(res.rows[0].count) + 1;
  return `INV-${String(n).padStart(4, '0')}`;
}

async function listInvoices(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT i.*, c.name as customer_name, cc.code as cost_centre_code, cc.name as cost_centre_name
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN cost_centres cc ON cc.id = i.cost_centre_id
     WHERE i.company_id = $1
     ORDER BY i.invoice_date DESC, i.created_at DESC`,
    [companyId]
  );
  res.json({ invoices: result.rows });
}

/**
 * Raise Customer Invoice (spec Section 7): the user picks a customer and line items —
 * no accounts involved. Debit Accounts Receivable / Credit Sales (+ VAT Payable) is
 * posted automatically. Pulled out of the HTTP handler so the Approval Workflow can
 * call this exact same logic once a pending request is approved, instead of the
 * approver's action needing its own separate (and separately-tested) posting code.
 */
async function buildInvoice(companyId, userId, body) {
  const { customerId, invoiceDate, dueDate, incomeCategory, lines, taxRatePercent } = body;

  if (!customerId || !invoiceDate || !Array.isArray(lines) || lines.length === 0) {
    throw httpError(400, 'Customer, invoice date, and at least one line item are required.');
  }

  const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];
  const baseCurrency = company?.currency || 'GHS';

  // Cost Centres: an optional tag for the P&L-by-centre breakdown — validated up front
  // like every other invoice-level lookup, but it never affects what gets posted.
  const costCentreId = await costCentreService.resolveCostCentreId(companyId, body.costCentreId);

  // A line that references an Inventory item issues stock and costs the sale (Cost of
  // Goods Sold) — figured out and validated up front, before anything is written, so a
  // stock shortfall fails the whole invoice cleanly instead of leaving it half-posted.
  const itemLines = lines.filter((l) => l.itemId);
  const itemCostCache = {};
  let cogsTotal = 0;
  const allowNegativeStock = !!company?.allow_negative_stock;
  if (itemLines.length > 0) {
    const neededByItem = {};
    for (const l of itemLines) neededByItem[l.itemId] = (neededByItem[l.itemId] || 0) + Number(l.quantity);

    for (const itemId of Object.keys(neededByItem)) {
      const item = await inventoryService.getItem(companyId, itemId);
      if (!item) throw httpError(400, 'One of the items on this invoice no longer exists.');
      itemCostCache[itemId] = Number(item.cost_price) || 0;
      const projectedQty = Number(item.quantity_on_hand) - neededByItem[itemId];
      if (projectedQty < 0 && !allowNegativeStock) {
        throw httpError(400, `Not enough stock of "${item.name}" (${item.quantity_on_hand} ${item.unit} on hand) to fulfill this invoice. Turn on "Allow negative stock" in Settings if this is expected.`);
      }
    }
    cogsTotal = Math.round(itemLines.reduce((sum, l) => sum + Number(l.quantity) * (itemCostCache[l.itemId] || 0), 0) * 100) / 100;
  }

  const receivableRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'Accounts Receivable' LIMIT 1`,
    [companyId]
  );
  const receivableAccount = receivableRes.rows[0];
  if (!receivableAccount) throw httpError(400, 'No Accounts Receivable account configured for this company.');

  const incomeRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = $2 LIMIT 1`,
    [companyId, incomeCategory || 'Sales']
  );
  const incomeAccount = incomeRes.rows[0];
  if (!incomeAccount) throw httpError(400, `Unknown income category: ${incomeCategory || 'Sales'}`);

  const vatRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = 'VAT Payable' LIMIT 1`,
    [companyId]
  );
  const vatAccount = vatRes.rows[0];

  // Multi-Currency: line amounts are whatever currency the user typed them in. If that
  // differs from the company's base currency, everything that posts to the ledger
  // (subtotal/tax/total below, and the journal entry) is converted to base currency —
  // the ledger and every report only ever deal in one currency. foreignTotal keeps the
  // original-currency total for display on the invoice itself.
  const { rate, isForeign } = await currencyService.resolveExchangeRate({
    companyId, currency: body.currency, baseCurrency, transactionDate: invoiceDate, manualRate: body.exchangeRate,
  });
  const { foreignSubtotal, baseSubtotal } = currencyService.convertLinesToBase(lines, rate);
  const subtotal = baseSubtotal;
  const tax = Math.round(subtotal * (Number(taxRatePercent || 0) / 100) * 100) / 100;
  const total = subtotal + tax;
  const foreignTax = isForeign ? Math.round(foreignSubtotal * (Number(taxRatePercent || 0) / 100) * 100) / 100 : 0;
  const foreignTotal = isForeign ? Math.round((foreignSubtotal + foreignTax) * 100) / 100 : null;

  const invoiceId = crypto.randomUUID();
  const invoiceNumber = await nextInvoiceNumber(companyId);

  const journalEntryId = await postInvoiceJournal({
    companyId,
    receivableAccountId: receivableAccount.id,
    incomeAccountId: incomeAccount.id,
    vatAccountId: vatAccount?.id,
    subtotal,
    tax,
    invoiceDate,
    reference: invoiceNumber,
    description: `Invoice ${invoiceNumber}`,
    createdBy: userId,
    sourceId: invoiceId,
  });

  await db.query(
    `INSERT INTO invoices (id, company_id, customer_id, invoice_number, invoice_date, due_date, income_account_id, subtotal, tax, total, paid, status, journal_entry_id, created_by, currency, exchange_rate, foreign_total, cost_centre_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,'posted',$11,$12,$13,$14,$15,$16)`,
    [invoiceId, companyId, customerId, invoiceNumber, invoiceDate, dueDate || null, incomeAccount.id, subtotal, tax, total, journalEntryId, userId, isForeign ? body.currency : null, rate, foreignTotal, costCentreId]
  );

  for (const line of lines) {
    await db.query(
      `INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price, line_total, item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), invoiceId, line.description, Number(line.quantity), Number(line.unitPrice), Number(line.quantity) * Number(line.unitPrice), line.itemId || null]
    );
  }

  // Cost of Goods Sold: one additional, additive journal entry (Debit COGS / Credit
  // Inventory) covering every item line on this invoice, then each item's stock is
  // issued at the average cost already captured above.
  let cogsJournalEntryId = null;
  if (itemLines.length > 0 && cogsTotal > 0) {
    const cogsAccount = await inventoryService.getAccountByGroup(companyId, 'Cost of Goods Sold');
    const inventoryAccount = await inventoryService.getAccountByGroup(companyId, 'Inventory');
    if (cogsAccount && inventoryAccount) {
      cogsJournalEntryId = await postJournalEntry({
        companyId, entryDate: invoiceDate, reference: invoiceNumber, description: `Cost of goods sold — ${invoiceNumber}`,
        sourceType: 'invoice_cogs', sourceId: invoiceId, createdBy: userId,
        lines: [
          { accountId: cogsAccount.id, debit: cogsTotal, credit: 0 },
          { accountId: inventoryAccount.id, debit: 0, credit: cogsTotal },
        ],
      });
    }
  }
  for (const line of itemLines) {
    await inventoryService.issueStock({
      companyId, itemId: line.itemId, quantity: Number(line.quantity), allowNegative: allowNegativeStock,
      movementType: 'sale', reference: invoiceNumber, sourceType: 'invoice', sourceId: invoiceId, journalEntryId: cogsJournalEntryId, createdBy: userId,
    });
  }

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'create','invoice',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, invoiceId, JSON.stringify({ total, customerId })]
  );

  return {
    invoiceId, invoiceNumber, total, journalEntryId,
    ...(cogsTotal > 0 ? { costOfGoodsSold: cogsTotal } : {}),
    ...(isForeign ? { currency: body.currency, exchangeRate: rate, foreignTotal } : {}),
    ...(costCentreId ? { costCentreId } : {}),
  };
}

/** For the approval-request inbox: a human-readable line + amount, computed without posting anything. */
async function describeInvoiceRequest(companyId, body) {
  const { customerId, lines } = body;
  const customerRes = customerId ? await db.query(`SELECT name FROM customers WHERE id = $1 AND company_id = $2`, [customerId, companyId]) : { rows: [] };
  const customerName = customerRes.rows[0]?.name || 'an unknown customer';
  const subtotal = (lines || []).reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = Math.round(subtotal * (Number(body.taxRatePercent || 0) / 100) * 100) / 100;
  const currencySuffix = body.currency ? ` (${body.currency})` : '';
  return { description: `Invoice to ${customerName}${currencySuffix}`, amount: subtotal + tax };
}

async function createInvoice(req, res) {
  const { companyId, sub: userId } = req.user;

  if (!req.body.customerId || !req.body.invoiceDate || !Array.isArray(req.body.lines) || req.body.lines.length === 0) {
    return res.status(400).json({ error: 'Customer, invoice date, and at least one line item are required.' });
  }

  const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];

  if (isApprovalRequired(company, 'sales_invoice')) {
    const { description, amount } = await describeInvoiceRequest(companyId, req.body);
    const request = await createApprovalRequest({ companyId, userId, module: 'sales_invoice', payload: req.body, description, amount, currency: company.currency });
    return res.status(202).json({ pendingApproval: true, approvalRequestId: request.id, message: 'Submitted for approval — the invoice will be created once approved.' });
  }

  const result = await buildInvoice(companyId, userId, req.body);
  res.status(201).json(result);
}

module.exports = { listInvoices, createInvoice, buildInvoice, describeInvoiceRequest };
