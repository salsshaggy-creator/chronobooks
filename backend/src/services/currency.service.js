const db = require('../config/db');
const { httpError } = require('./approval.service');

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Resolve the rate to convert `currency` into the company's base currency as of a
 * transaction date. A rate typed directly on the transaction always wins (lets someone
 * enter the exact bank/momo rate they were actually charged); otherwise it looks up the
 * most recent rate on or before the transaction date from Parameters -> Exchange Rates.
 * Same-currency transactions never touch this at all — rate is always exactly 1.
 */
async function resolveExchangeRate({ companyId, currency, baseCurrency, transactionDate, manualRate }) {
  if (!currency || currency === baseCurrency) {
    return { rate: 1, currency: baseCurrency, isForeign: false, source: 'base' };
  }

  if (manualRate != null && manualRate !== '' && Number(manualRate) > 0) {
    return { rate: Number(manualRate), currency, isForeign: true, source: 'manual' };
  }

  const res = await db.query(
    `SELECT rate, as_of_date FROM exchange_rates
     WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3 AND as_of_date <= $4
     ORDER BY as_of_date DESC LIMIT 1`,
    [companyId, currency, baseCurrency, transactionDate]
  );
  const found = res.rows[0];
  if (!found) {
    throw httpError(400, `No exchange rate found for ${currency} → ${baseCurrency} on or before ${transactionDate}. Add one in Settings → Parameters → Exchange Rates, or type a rate directly on this transaction.`);
  }
  return { rate: Number(found.rate), currency, isForeign: true, source: 'parameters', asOfDate: found.as_of_date };
}

/**
 * Given line items priced in a foreign currency, returns the foreign-currency subtotal
 * (what the user actually typed) alongside its base-currency equivalent (what actually
 * posts to the ledger — journal_lines and every report only ever deal in base currency).
 */
function convertLinesToBase(lines, rate) {
  const foreignSubtotal = round2(lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0));
  const baseSubtotal = round2(foreignSubtotal * rate);
  return { foreignSubtotal, baseSubtotal };
}

module.exports = { resolveExchangeRate, convertLinesToBase, round2 };
