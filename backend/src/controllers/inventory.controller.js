const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('../services/approval.service');
const inventoryService = require('../services/inventory.service');

async function getCompany(companyId) {
  const res = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  return res.rows[0];
}

/** GET /inventory/items — the stock list, with a lowStock flag so the UI can badge it without extra client-side math. */
async function listItems(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT * FROM inventory_items WHERE company_id = $1 ORDER BY is_active DESC, name ASC`,
    [companyId]
  );
  const items = result.rows.map((i) => ({
    ...i,
    lowStock: Number(i.reorder_level) > 0 && Number(i.quantity_on_hand) <= Number(i.reorder_level),
    stockValue: Math.round(Number(i.quantity_on_hand) * Number(i.cost_price) * 100) / 100,
  }));
  res.json({ items });
}

/** POST /inventory/items — create an item, optionally with an opening quantity/cost (recorded as an 'opening' movement, no journal entry — same treatment as an opening Chart of Accounts balance). */
async function createItem(req, res) {
  const { companyId, sub: userId } = req.user;
  const { name, sku, unit, category, salePrice, reorderLevel, openingQuantity, openingCost } = req.body;

  if (!name) throw httpError(400, 'Item name is required.');

  if (sku) {
    const dupe = await db.query(`SELECT id FROM inventory_items WHERE company_id = $1 AND sku = $2`, [companyId, sku]);
    if (dupe.rows.length) throw httpError(400, `An item with SKU "${sku}" already exists.`);
  }

  const itemId = crypto.randomUUID();
  const qty = Number(openingQuantity || 0);
  const cost = Number(openingCost || 0);

  await db.query(
    `INSERT INTO inventory_items (id, company_id, sku, name, unit, category, cost_price, sale_price, quantity_on_hand, reorder_level, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
    [itemId, companyId, sku || null, name, unit || 'unit', category || null, cost, salePrice != null && salePrice !== '' ? Number(salePrice) : null, qty, Number(reorderLevel || 0)]
  );

  if (qty > 0) {
    await db.query(
      `INSERT INTO stock_movements (id, company_id, item_id, movement_type, quantity, unit_cost, reference, source_type, created_by)
       VALUES ($1,$2,$3,'opening',$4,$5,'Opening balance','item',$6)`,
      [crypto.randomUUID(), companyId, itemId, qty, cost, userId]
    );
  }

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'create','inventory_item',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, itemId, JSON.stringify({ name, sku, openingQuantity: qty })]
  );

  res.status(201).json({ itemId });
}

/** PUT /inventory/items/:id — edit the item's descriptive fields. Quantity and cost only ever move via a receipt, issue, or adjustment. */
async function updateItem(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const item = await inventoryService.getItem(companyId, id);
  if (!item) throw httpError(404, 'Inventory item not found.');

  const { name, sku, unit, category, salePrice, reorderLevel, isActive } = req.body;

  if (sku && sku !== item.sku) {
    const dupe = await db.query(`SELECT id FROM inventory_items WHERE company_id = $1 AND sku = $2 AND id != $3`, [companyId, sku, id]);
    if (dupe.rows.length) throw httpError(400, `An item with SKU "${sku}" already exists.`);
  }

  await db.query(
    `UPDATE inventory_items SET name = $1, sku = $2, unit = $3, category = $4, sale_price = $5, reorder_level = $6, is_active = $7, updated_at = CURRENT_TIMESTAMP
     WHERE id = $8 AND company_id = $9`,
    [
      name ?? item.name,
      sku !== undefined ? (sku || null) : item.sku,
      unit ?? item.unit,
      category !== undefined ? category : item.category,
      salePrice !== undefined ? (salePrice === '' ? null : Number(salePrice)) : item.sale_price,
      reorderLevel !== undefined ? Number(reorderLevel) : item.reorder_level,
      isActive !== undefined ? (isActive ? '1' : '0') : item.is_active,
      id, companyId,
    ]
  );

  res.json({ ok: true });
}

/** GET /inventory/items/:id/movements — the audit trail for one item's stock changes. */
async function listMovements(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const item = await inventoryService.getItem(companyId, id);
  if (!item) throw httpError(404, 'Inventory item not found.');

  const result = await db.query(
    `SELECT m.*, u.full_name as created_by_name FROM stock_movements m LEFT JOIN users u ON u.id = m.created_by
     WHERE m.item_id = $1 AND m.company_id = $2 ORDER BY m.created_at DESC`,
    [id, companyId]
  );
  res.json({ item, movements: result.rows });
}

/** POST /inventory/items/:id/adjust — manual correction (stock take, damage, found stock). Posts its own journal entry. */
async function adjustStock(req, res) {
  const { companyId, sub: userId } = req.user;
  const { id } = req.params;
  const { quantityDelta, unitCost, reason } = req.body;

  if (!reason) throw httpError(400, 'A reason is required for a stock adjustment.');

  const company = await getCompany(companyId);
  const result = await inventoryService.adjustStock({
    companyId, itemId: id, delta: Number(quantityDelta), unitCost, reason,
    allowNegative: !!company.allow_negative_stock, userId,
  });

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'adjust','inventory_item',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, id, JSON.stringify({ quantityDelta, reason })]
  );

  res.json(result);
}

module.exports = { listItems, createItem, updateItem, listMovements, adjustStock };
