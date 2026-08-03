const crypto = require('crypto');
const db = require('../config/db');
const { postJournalEntry } = require('./journal.service');
const { httpError } = require('./approval.service');

const round2 = (n) => Math.round(Number(n) * 100) / 100;

async function getAsset(companyId, assetId) {
  const res = await db.query(`SELECT * FROM fixed_assets WHERE id = $1 AND company_id = $2`, [assetId, companyId]);
  return res.rows[0] || null;
}

async function getAccountByGroup(companyId, groupName) {
  const res = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND group_name = $2 LIMIT 1`, [companyId, groupName]);
  return res.rows[0] || null;
}

async function getAccountByCode(companyId, code) {
  const res = await db.query(`SELECT id FROM accounts WHERE company_id = $1 AND code = $2 LIMIT 1`, [companyId, code]);
  return res.rows[0] || null;
}

function monthlyDepreciationAmount(asset) {
  const depreciableBase = Number(asset.purchase_cost) - Number(asset.salvage_value);
  if (Number(asset.useful_life_months) <= 0) return 0;
  return round2(depreciableBase / Number(asset.useful_life_months));
}

/**
 * Whole-month proration from the purchase date (or the last time depreciation was run,
 * whichever is later) up to asOfDate — the simplest way for a non-accountant to reason
 * about "how many months has this been depreciating for", rather than day-level
 * proration. Caps the amount so an asset never depreciates below its salvage value.
 */
function monthsElapsed(fromDateStr, asOfDateStr) {
  const from = new Date(fromDateStr);
  const asOf = new Date(asOfDateStr);
  const months = (asOf.getFullYear() - from.getFullYear()) * 12 + (asOf.getMonth() - from.getMonth());
  return Math.max(0, months);
}

function computeDepreciation(asset, asOfDate) {
  const periodStart = asset.last_depreciated_date || asset.purchase_date;
  const months = monthsElapsed(periodStart, asOfDate);
  if (months <= 0) return null;

  const monthly = monthlyDepreciationAmount(asset);
  const depreciableBase = round2(Number(asset.purchase_cost) - Number(asset.salvage_value));
  const remaining = round2(depreciableBase - Number(asset.accumulated_depreciation));
  if (remaining <= 0) return null;

  const amount = Math.min(round2(monthly * months), remaining);
  if (amount <= 0) return null;

  return { amount, periodStart, periodEnd: asOfDate, months };
}

/**
 * Register an asset: posts Debit Fixed Assets / Credit whatever account it was paid
 * from — the same shape as recording an Expense, except capitalized instead of
 * expensed. useful_life_months, purchase_cost, and salvage_value together determine the
 * straight-line monthly depreciation charge.
 */
async function registerAsset(companyId, userId, body) {
  const { name, assetNumber, category, purchaseDate, purchaseCost, salvageValue, usefulLifeMonths, paidFromAccountCode } = body;

  if (!name || !purchaseDate || !purchaseCost || !usefulLifeMonths || !paidFromAccountCode) {
    throw httpError(400, 'Name, purchase date, cost, useful life (months), and a paid-from account are required.');
  }
  if (Number(usefulLifeMonths) <= 0) throw httpError(400, 'Useful life must be at least 1 month.');
  if (Number(salvageValue || 0) >= Number(purchaseCost)) throw httpError(400, 'Salvage value must be less than the purchase cost.');

  const fixedAssetAccount = await getAccountByGroup(companyId, 'Fixed Assets');
  if (!fixedAssetAccount) throw httpError(400, 'No Fixed Assets account configured for this company.');
  const paidFromAccount = await getAccountByCode(companyId, paidFromAccountCode);
  if (!paidFromAccount) throw httpError(400, `Unknown paid-from account: ${paidFromAccountCode}`);

  const assetId = crypto.randomUUID();

  const journalEntryId = await postJournalEntry({
    companyId, entryDate: purchaseDate, reference: assetNumber || name, description: `Fixed asset acquired: ${name}`,
    sourceType: 'fixed_asset', sourceId: assetId, createdBy: userId,
    lines: [
      { accountId: fixedAssetAccount.id, debit: Number(purchaseCost), credit: 0 },
      { accountId: paidFromAccount.id, debit: 0, credit: Number(purchaseCost) },
    ],
  });

  await db.query(
    `INSERT INTO fixed_assets (id, company_id, name, asset_number, category, purchase_date, purchase_cost, salvage_value, useful_life_months, acquisition_journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [assetId, companyId, name, assetNumber || null, category || null, purchaseDate, Number(purchaseCost), Number(salvageValue || 0), Number(usefulLifeMonths), journalEntryId, userId]
  );

  return { assetId, journalEntryId };
}

/**
 * Run depreciation for every active asset up to asOfDate, in one batch. Assets with
 * nothing to depreciate this period (already fully depreciated, or no whole month has
 * elapsed since the last run) are simply skipped. One combined journal entry covers the
 * whole batch (Debit Depreciation Expense / Credit Accumulated Depreciation), with a
 * depreciation_runs row per asset for the audit trail.
 */
async function runDepreciation(companyId, userId, asOfDate) {
  const assetsRes = await db.query(`SELECT * FROM fixed_assets WHERE company_id = $1 AND status = 'active'`, [companyId]);
  const candidates = assetsRes.rows.map((asset) => ({ asset, calc: computeDepreciation(asset, asOfDate) })).filter((c) => c.calc);

  if (candidates.length === 0) {
    return { journalEntryId: null, assetsDepreciated: [], totalAmount: 0 };
  }

  const totalAmount = round2(candidates.reduce((sum, c) => sum + c.calc.amount, 0));

  const depreciationExpenseAccount = await getAccountByGroup(companyId, 'Depreciation Expense');
  const accumulatedDepAccount = await getAccountByGroup(companyId, 'Accumulated Depreciation');
  if (!depreciationExpenseAccount || !accumulatedDepAccount) throw httpError(400, 'Depreciation GL accounts are not configured for this company.');

  const journalEntryId = await postJournalEntry({
    companyId, entryDate: asOfDate, reference: `DEP-${asOfDate}`, description: `Depreciation run as of ${asOfDate}`,
    sourceType: 'depreciation_run', sourceId: null, createdBy: userId,
    lines: [
      { accountId: depreciationExpenseAccount.id, debit: totalAmount, credit: 0 },
      { accountId: accumulatedDepAccount.id, debit: 0, credit: totalAmount },
    ],
  });

  const assetsDepreciated = [];
  for (const { asset, calc } of candidates) {
    const newAccumulated = round2(Number(asset.accumulated_depreciation) + calc.amount);
    await db.query(
      `UPDATE fixed_assets SET accumulated_depreciation = $1, last_depreciated_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [newAccumulated, asOfDate, asset.id]
    );
    await db.query(
      `INSERT INTO depreciation_runs (id, company_id, asset_id, period_start, period_end, amount, journal_entry_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [crypto.randomUUID(), companyId, asset.id, calc.periodStart, calc.periodEnd, calc.amount, journalEntryId, userId]
    );
    assetsDepreciated.push({ assetId: asset.id, name: asset.name, amount: calc.amount, accumulatedDepreciation: newAccumulated });
  }

  return { journalEntryId, assetsDepreciated, totalAmount };
}

/**
 * Dispose an asset: clears its Accumulated Depreciation, removes it from the books at
 * original cost, records any cash received, and recognizes a Gain or Loss on Disposal
 * for the difference between proceeds and net book value. Always balances — see the
 * derivation in the module's design notes (debits = credits in both the gain and loss
 * case, since gainLoss = proceeds - (cost - accumulatedDepreciation) by construction).
 */
async function disposeAsset(companyId, userId, { assetId, disposalDate, proceeds, depositToAccountCode }) {
  const asset = await getAsset(companyId, assetId);
  if (!asset) throw httpError(404, 'Fixed asset not found.');
  if (asset.status === 'disposed') throw httpError(400, 'This asset has already been disposed of.');
  if (!disposalDate) throw httpError(400, 'A disposal date is required.');

  const proceedsAmount = round2(Number(proceeds || 0));
  if (proceedsAmount > 0 && !depositToAccountCode) throw httpError(400, 'Choose which account the disposal proceeds were deposited to.');

  const cost = Number(asset.purchase_cost);
  const accumulatedDepreciation = Number(asset.accumulated_depreciation);
  const bookValue = round2(cost - accumulatedDepreciation);
  const gainLoss = round2(proceedsAmount - bookValue);

  const fixedAssetAccount = await getAccountByGroup(companyId, 'Fixed Assets');
  const accumulatedDepAccount = await getAccountByGroup(companyId, 'Accumulated Depreciation');
  const gainAccount = await getAccountByGroup(companyId, 'Gain on Disposal of Assets');
  const lossAccount = await getAccountByGroup(companyId, 'Loss on Disposal of Assets');
  const depositAccount = proceedsAmount > 0 ? await getAccountByCode(companyId, depositToAccountCode) : null;
  if (proceedsAmount > 0 && !depositAccount) throw httpError(400, `Unknown deposit account: ${depositToAccountCode}`);
  if (!fixedAssetAccount || !accumulatedDepAccount || !gainAccount || !lossAccount) {
    throw httpError(400, 'Disposal GL accounts are not configured for this company.');
  }

  const lines = [];
  if (accumulatedDepreciation > 0) lines.push({ accountId: accumulatedDepAccount.id, debit: accumulatedDepreciation, credit: 0 });
  if (proceedsAmount > 0) lines.push({ accountId: depositAccount.id, debit: proceedsAmount, credit: 0 });
  lines.push({ accountId: fixedAssetAccount.id, debit: 0, credit: cost });
  if (gainLoss > 0) lines.push({ accountId: gainAccount.id, debit: 0, credit: gainLoss });
  if (gainLoss < 0) lines.push({ accountId: lossAccount.id, debit: -gainLoss, credit: 0 });

  const journalEntryId = await postJournalEntry({
    companyId, entryDate: disposalDate, reference: asset.asset_number || asset.name, description: `Disposal of fixed asset: ${asset.name}`,
    sourceType: 'fixed_asset_disposal', sourceId: assetId, createdBy: userId, lines,
  });

  await db.query(
    `UPDATE fixed_assets SET status = 'disposed', disposal_date = $1, disposal_proceeds = $2, disposal_journal_entry_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
    [disposalDate, proceedsAmount, journalEntryId, assetId]
  );

  return { journalEntryId, bookValue, gainLoss };
}

module.exports = { getAsset, monthlyDepreciationAmount, computeDepreciation, registerAsset, runDepreciation, disposeAsset, round2 };
