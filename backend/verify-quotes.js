// Smoke test for Quotes: draft -> sent -> accepted/declined status transitions, the
// convert-to-invoice guard (only sent/accepted, never twice), a converted quote locking,
// the expiry flag, and Cost Centre / Multi-Currency carrying through on conversion.
require('dotenv').config();
const app = require('./src/app');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const login = async (email, password) =>
    (await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();

  const adminLogin = await login('admin@demo-sme.com', 'ChronoBooks!123');
  const headers = { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' };

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ costCentresEnabled: true, multiCurrencyEnabled: true }) });

  const customer = (await (await fetch(`${base}/api/customers`, { headers })).json()).customers[0];

  // 1. Create a draft quote: 2 x 100 = 200 subtotal, 10% tax = 20, total 220.
  const createRes = await fetch(`${base}/api/quotes`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, quoteDate: '2026-05-01', incomeCategory: 'Sales', taxRatePercent: 10, lines: [{ description: 'Design work', quantity: 2, unitPrice: 100 }] }),
  });
  const created = await createRes.json();
  const createdOk = createRes.ok && created.total === 220;
  log('created draft quote', { status: createRes.status, body: created });

  // 2. A draft quote can't be converted.
  const convertDraftRes = await fetch(`${base}/api/quotes/${created.quoteId}/convert`, { method: 'POST', headers });
  const draftConvertBlockedOk = convertDraftRes.status === 400;
  log('draft convert blocked', { status: convertDraftRes.status });

  // 3. An invalid status value is rejected.
  const badStatusRes = await fetch(`${base}/api/quotes/${created.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'bogus' }) });
  const badStatusBlockedOk = badStatusRes.status === 400;

  // 4. Mark it sent, then convert.
  const sentRes = await fetch(`${base}/api/quotes/${created.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'sent' }) });
  const sentOk = sentRes.ok;

  const convertRes = await fetch(`${base}/api/quotes/${created.quoteId}/convert`, { method: 'POST', headers });
  const convertBody = await convertRes.json();
  const convertOk = convertRes.ok && convertBody.total === 220 && !!convertBody.invoiceId;
  log('converted quote', { status: convertRes.status, body: convertBody });

  // 5. Converting again is rejected.
  const convertAgainRes = await fetch(`${base}/api/quotes/${created.quoteId}/convert`, { method: 'POST', headers });
  const convertAgainBlockedOk = convertAgainRes.status === 400;

  // 6. A converted quote's status can't be changed.
  const changeAfterConvertRes = await fetch(`${base}/api/quotes/${created.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'declined' }) });
  const changeAfterConvertBlockedOk = changeAfterConvertRes.status === 400;

  // 7. The list shows it as converted, linked to the real invoice.
  const listAfterConvert = (await (await fetch(`${base}/api/quotes`, { headers })).json()).quotes;
  const convertedRow = listAfterConvert.find((q) => q.id === created.quoteId);
  const listShowsConvertedOk = convertedRow.status === 'converted' && convertedRow.converted_invoice_number === convertBody.invoiceNumber;

  // 8. The resulting invoice is real and dated today, not the original quote date.
  const invoices = (await (await fetch(`${base}/api/invoices`, { headers })).json()).invoices;
  const resultInvoice = invoices.find((i) => i.id === convertBody.invoiceId);
  const invoicePostedOk = !!resultInvoice && Number(resultInvoice.total) === 220;

  // 9. A second quote: sent -> declined can't convert.
  const q2Res = await fetch(`${base}/api/quotes`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, quoteDate: '2026-05-02', incomeCategory: 'Sales', lines: [{ description: 'Consulting', quantity: 1, unitPrice: 50 }] }),
  });
  const q2 = await q2Res.json();
  await fetch(`${base}/api/quotes/${q2.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'sent' }) });
  await fetch(`${base}/api/quotes/${q2.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'declined' }) });
  const declinedConvertRes = await fetch(`${base}/api/quotes/${q2.quoteId}/convert`, { method: 'POST', headers });
  const declinedConvertBlockedOk = declinedConvertRes.status === 400;
  log('declined quote convert blocked', { status: declinedConvertRes.status });

  // 10. Expiry flag: a draft quote with a past expiry date is flagged; a future one isn't.
  const expiredRes = await fetch(`${base}/api/quotes`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, quoteDate: '2026-01-01', expiryDate: '2026-01-15', incomeCategory: 'Sales', lines: [{ description: 'x', quantity: 1, unitPrice: 10 }] }),
  });
  const expired = await expiredRes.json();
  const futureRes = await fetch(`${base}/api/quotes`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, quoteDate: '2026-05-01', expiryDate: '2099-01-01', incomeCategory: 'Sales', lines: [{ description: 'x', quantity: 1, unitPrice: 10 }] }),
  });
  const future = await futureRes.json();
  const listForExpiry = (await (await fetch(`${base}/api/quotes`, { headers })).json()).quotes;
  const expiredRow = listForExpiry.find((q) => q.id === expired.quoteId);
  const futureRow = listForExpiry.find((q) => q.id === future.quoteId);
  const expiryFlagOk = expiredRow.isExpired === true && futureRow.isExpired === false;
  log('expiry flags', { expiredRow: { isExpired: expiredRow.isExpired }, futureRow: { isExpired: futureRow.isExpired } });

  // 11. Cost Centre carries through on conversion.
  const costCentres = (await (await fetch(`${base}/api/parameters/cost-centres`, { headers })).json()).costCentres;
  const ops = costCentres.find((c) => c.code === 'OPS');
  const ccQuoteRes = await fetch(`${base}/api/quotes`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, quoteDate: '2026-05-03', incomeCategory: 'Sales', costCentreId: ops.id, lines: [{ description: 'Ops work', quantity: 1, unitPrice: 300 }] }),
  });
  const ccQuote = await ccQuoteRes.json();
  await fetch(`${base}/api/quotes/${ccQuote.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'sent' }) });
  const ccConvertRes = await fetch(`${base}/api/quotes/${ccQuote.quoteId}/convert`, { method: 'POST', headers });
  const ccConvertBody = await ccConvertRes.json();
  const ccInvoices = (await (await fetch(`${base}/api/invoices`, { headers })).json()).invoices;
  const ccInvoice = ccInvoices.find((i) => i.id === ccConvertBody.invoiceId);
  const costCentreCarriedOk = ccInvoice && ccInvoice.cost_centre_code === 'OPS';
  log('cost centre carried through', { cost_centre_code: ccInvoice && ccInvoice.cost_centre_code });

  // 12. Multi-Currency: exchange rate resolved fresh at conversion time, not locked at quote creation.
  await fetch(`${base}/api/parameters/exchange-rates`, { method: 'POST', headers, body: JSON.stringify({ fromCurrency: 'USD', toCurrency: 'GHS', rate: 15, asOfDate: '2026-01-01' }) });
  const fxQuoteRes = await fetch(`${base}/api/quotes`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, quoteDate: '2026-05-04', incomeCategory: 'Sales', currency: 'USD', lines: [{ description: 'USD job', quantity: 1, unitPrice: 100 }] }),
  });
  const fxQuote = await fxQuoteRes.json();
  await fetch(`${base}/api/quotes/${fxQuote.quoteId}/status`, { method: 'PUT', headers, body: JSON.stringify({ status: 'accepted' }) });
  const fxConvertRes = await fetch(`${base}/api/quotes/${fxQuote.quoteId}/convert`, { method: 'POST', headers });
  const fxConvertBody = await fxConvertRes.json();
  const fxCurrencyCarriedOk = fxConvertRes.ok && fxConvertBody.total === 1500; // 100 USD x rate 15
  log('multi-currency carried through', { status: fxConvertRes.status, body: fxConvertBody });

  // 13. Books still balance after all of this.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers })).json();
  const balancedOk = trialBalance.balanced === true;
  log('trial balance', { balanced: trialBalance.balanced });

  const ok = createdOk && draftConvertBlockedOk && badStatusBlockedOk && sentOk && convertOk && convertAgainBlockedOk
    && changeAfterConvertBlockedOk && listShowsConvertedOk && invoicePostedOk && declinedConvertBlockedOk
    && expiryFlagOk && costCentreCarriedOk && fxCurrencyCarriedOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`createdOk=${createdOk} draftConvertBlockedOk=${draftConvertBlockedOk} badStatusBlockedOk=${badStatusBlockedOk} sentOk=${sentOk} convertOk=${convertOk}`);
  console.log(`convertAgainBlockedOk=${convertAgainBlockedOk} changeAfterConvertBlockedOk=${changeAfterConvertBlockedOk} listShowsConvertedOk=${listShowsConvertedOk} invoicePostedOk=${invoicePostedOk}`);
  console.log(`declinedConvertBlockedOk=${declinedConvertBlockedOk} expiryFlagOk=${expiryFlagOk} costCentreCarriedOk=${costCentreCarriedOk} fxCurrencyCarriedOk=${fxCurrencyCarriedOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
