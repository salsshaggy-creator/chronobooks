const crypto = require('crypto');
const db = require('../config/db');
const { postJournalEntry } = require('./journal.service');
const { httpError } = require('./approval.service');

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

async function getItem(companyId, itemId) {
  const res = await db.query(`SELECT * FROM inventory_items WHERE id = $1 AND company_id = $2`, [itemId, companyId]);
  return res.rows[0] || null;
}

async function getAccountByGroup(companyId, groupName) {
  const res = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND group_name = $2 LIMIT 1`, [companyId, groupName]);
  return res.rows[0] || null;
}

/**
 * Weighted-average costing (the simplest method a non-accountant owner can reason
 * about: "what did my stock cost me on average"). Every stock-in movement blends its
 * cost into the running average; stock-out movements always issue at the current
 * average and never change it.
 */
function blendAverageCost(oldQty, oldCost, addQty, addCost) {
  const newQty = Number(oldQty) + Number(addQty);
  if (newQty <= 0) return Number(addCost) || 0;
  const blended = (Number(oldQty) * Number(oldCost) + Number(addQty) * Number(addCost)) / newQty;
  return round4(blended);
}

/**
 * Stock in — used by manual "increase" adjustments and by Purchases (a bill line that
 * references an item). Updates quantity_on_hand and the weighted-average cost, then
 * records the movement. journalEntryId is optional: purchases pass null because the
 * bill's own journal entry already covers the financial side (Debit Inventory / Credit
 * Accounts Payable) — only adjustments post their own dedicated entry.
 */
async function receiveStock({ companyId, itemId, quantity, unitCost, movementType, reference, sourceType, sourceId, journalEntryId, createdBy }) {
  const item = await getItem(companyId, itemId);
  if (!item) throw httpError(404, 'Inventory item not found.');
  if (!(Number(quantity) > 0)) throw httpError(400, 'Quantity received must be greater than zero.');

  const newQty = round4(Number(item.quantity_on_hand) + Number(quantity));
  const newCost = blendAverageCost(item.quantity_on_hand, item.cost_price, quantity, unitCost);

  await db.query(
    `UPDATE inventory_items SET quantity_on_hand = $1, cost_price = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
    [newQty, newCost, itemId]
  );

  await db.query(
    `INSERT INTO stock_movements (id, company_id, item_id, movement_type, quantity, unit_cost, reference, source_type, source_id, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [crypto.randomUUID(), companyId, itemId, movementType, Number(quantity), Number(unitCost) || 0, reference || null, sourceType || null, sourceId || null, journalEntryId || null, createdBy || null]
  );

  return { quantityOnHand: newQty, costPrice: newCost };
}

/**
 * Stock out — used by manual "decrease" adjustments and by Sales (an invoice line that
 * references an item). Issues at the item's current average cost (returned to the
 * caller so it can post Cost of Goods Sold), and refuses to take stock negative unless
 * the company's "allow negative stock" preference is on.
 */
async function issueStock({ companyId, itemId, quantity, allowNegative, movementType, reference, sourceType, sourceId, journalEntryId, createdBy }) {
  const item = await getItem(companyId, itemId);
  if (!item) throw httpError(404, 'Inventory item not found.');
  if (!(Number(quantity) > 0)) throw httpError(400, 'Quantity issued must be greater than zero.');

  const unitCost = Number(item.cost_price) || 0;
  const newQty = round4(Number(item.quantity_on_hand) - Number(quantity));
  if (newQty < 0 && !allowNegative) {
    throw httpError(400, `Not enough stock of "${item.name}" (${item.quantity_on_hand} ${item.unit} on hand). Turn on "Allow negative stock" in Settings if this is expected.`);
  }

  await db.query(`UPDATE inventory_items SET quantity_on_hand = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newQty, itemId]);

  await db.query(
    `INSERT INTO stock_movements (id, company_id, item_id, movement_type, quantity, unit_cost, reference, source_type, source_id, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [crypto.randomUUID(), companyId, itemId, movementType, -Number(quantity), unitCost, reference || null, sourceType || null, sourceId || null, journalEntryId || null, createdBy || null]
  );

  return { quantityOnHand: newQty, unitCostUsed: unitCost, costOfGoodsSold: round2(unitCost * Number(quantity)) };
}

/** Manual stock adjustment (stock take, damage, correction) — posts its own journal entry against the Inventory Adjustments variance account. */
async function adjustStock({ companyId, itemId, delta, unitCost, reason, allowNegative, userId }) {
  if (!delta || Number(delta) === 0) throw httpError(400, 'Adjustment quantity must not be zero.');

  const inventoryAccount = await getAccountByGroup(companyId, 'Inventory');
  const adjustmentAccount = await getAccountByGroup(companyId, 'Inventory Adjustments');
  if (!inventoryAccount || !adjustmentAccount) throw httpError(400, 'Inventory GL accounts are not configured for this company.');

  const item = await getItem(companyId, itemId);
  if (!item) throw httpError(404, 'Inventory item not found.');

  const isIncrease = Number(delta) > 0;
  const qty = Math.abs(Number(delta));
  const cost = isIncrease ? (unitCost != null && unitCost !== '' ? Number(unitCost) : Number(item.cost_price) || 0) : Number(item.cost_price) || 0;
  const value = round2(qty * cost);

  const journalEntryId = await postJournalEntry({
    companyId,
    entryDate: new Date().toISOString().slice(0, 10),
    reference: `ADJ-${item.sku || item.name}`,
    description: reason || `Stock adjustment: ${item.name}`,
    sourceType: 'stock_adjustment',
    sourceId: itemId,
    createdBy: userId,
    lines: isIncrease
      ? [{ accountId: inventoryAccount.id, debit: value, credit: 0 }, { accountId: adjustmentAccount.id, debit: 0, credit: value }]
      : [{ accountId: adjustmentAccount.id, debit: value, credit: 0 }, { accountId: inventoryAccount.id, debit: 0, credit: value }],
  });

  const result = isIncrease
    ? await receiveStock({ companyId, itemId, quantity: qty, unitCost: cost, movementType: 'adjustment', reference: reason, sourceType: 'adjustment', sourceId: itemId, journalEntryId, createdBy: userId })
    : await issueStock({ companyId, itemId, quantity: qty, allowNegative, movementType: 'adjustment', reference: reason, sourceType: 'adjustment', sourceId: itemId, journalEntryId, createdBy: userId });

  return { ...result, journalEntryId, value };
}

module.exports = { getItem, getAccountByGroup, blendAverageCost, receiveStock, issueStock, adjustStock, round2, round4 };
