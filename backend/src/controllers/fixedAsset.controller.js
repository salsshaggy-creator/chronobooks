const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('../services/approval.service');
const assetService = require('../services/fixedAsset.service');

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** GET /fixed-assets — the register, with net book value and this period's depreciation already computed for the UI. */
async function listAssets(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM fixed_assets WHERE company_id = $1 ORDER BY status ASC, purchase_date DESC`, [companyId]);
  const assets = result.rows.map((a) => {
    const netBookValue = assetService.round2(Number(a.purchase_cost) - Number(a.accumulated_depreciation));
    return {
      ...a,
      netBookValue,
      monthlyDepreciation: assetService.monthlyDepreciationAmount(a),
      fullyDepreciated: netBookValue <= Number(a.salvage_value),
    };
  });
  res.json({ assets });
}

/** POST /fixed-assets — register a new asset; posts Debit Fixed Assets / Credit paid-from account. */
async function createAsset(req, res) {
  const { companyId, sub: userId } = req.user;
  const result = await assetService.registerAsset(companyId, userId, req.body);
  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'create','fixed_asset',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, result.assetId, JSON.stringify({ name: req.body.name, purchaseCost: req.body.purchaseCost })]
  );
  res.status(201).json(result);
}

/** PUT /fixed-assets/:id — edit descriptive fields only; cost/depreciation only ever move via a depreciation run or disposal. */
async function updateAsset(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const asset = await assetService.getAsset(companyId, id);
  if (!asset) throw httpError(404, 'Fixed asset not found.');

  const { name, assetNumber, category } = req.body;
  await db.query(
    `UPDATE fixed_assets SET name = $1, asset_number = $2, category = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND company_id = $5`,
    [name ?? asset.name, assetNumber !== undefined ? (assetNumber || null) : asset.asset_number, category !== undefined ? category : asset.category, id, companyId]
  );
  res.json({ ok: true });
}

/** POST /fixed-assets/depreciate — run straight-line depreciation for every active asset up to a date (defaults to today). */
async function runDepreciation(req, res) {
  const { companyId, sub: userId } = req.user;
  const asOfDate = req.body.asOfDate || today();
  const result = await assetService.runDepreciation(companyId, userId, asOfDate);

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'depreciate','fixed_asset',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, null, JSON.stringify({ asOfDate, totalAmount: result.totalAmount, assetCount: result.assetsDepreciated.length })]
  );

  res.json(result);
}

/** POST /fixed-assets/:id/dispose — remove the asset from the books, recognizing any gain/loss on disposal. */
async function disposeAsset(req, res) {
  const { companyId, sub: userId } = req.user;
  const { id } = req.params;
  const { disposalDate, proceeds, depositToAccountCode } = req.body;

  const result = await assetService.disposeAsset(companyId, userId, { assetId: id, disposalDate, proceeds, depositToAccountCode });

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'dispose','fixed_asset',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, id, JSON.stringify({ disposalDate, proceeds, gainLoss: result.gainLoss })]
  );

  res.json(result);
}

/** GET /fixed-assets/:id/movements — depreciation run history for one asset. */
async function listMovements(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const asset = await assetService.getAsset(companyId, id);
  if (!asset) throw httpError(404, 'Fixed asset not found.');

  const result = await db.query(
    `SELECT r.*, u.full_name as created_by_name FROM depreciation_runs r LEFT JOIN users u ON u.id = r.created_by
     WHERE r.asset_id = $1 AND r.company_id = $2 ORDER BY r.period_end DESC`,
    [id, companyId]
  );
  res.json({ asset, movements: result.rows });
}

module.exports = { listAssets, createAsset, updateAsset, runDepreciation, disposeAsset, listMovements };
