/**
 * Smoke test for GET /invoices/:id -- backs both the new "Details" expand row
 * and the CSV download on the Sales page.
 */
const app = require('./src/app');

async function main() {
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}/api`;

  async function req(path, opts = {}) {
    const res = await fetch(base + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  const loginRes = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@demo-sme.com', password: 'ChronoBooks!123' }),
  });
  const token = loginRes.body.accessToken;
  const authed = (path, opts = {}) => req(path, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });

  const customersRes = await authed('/customers');
  const customerId = customersRes.body.customers[0].id;

  const invRes = await authed('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      customerId,
      invoiceDate: '2026-08-01',
      lines: [
        { description: 'Consulting hours', quantity: 3, unitPrice: 150 },
        { description: 'Travel expense reimbursement', quantity: 1, unitPrice: 50 },
      ],
    }),
  });
  if (invRes.status !== 201) {
    console.log('Invoice creation failed:', invRes.status, invRes.body);
    process.exit(1);
  }
  const invoiceId = invRes.body.invoiceId;

  const detailRes = await authed(`/invoices/${invoiceId}`);
  const detailOk = detailRes.status === 200
    && detailRes.body.invoice?.id === invoiceId
    && detailRes.body.invoice?.customer_name
    && Array.isArray(detailRes.body.lines)
    && detailRes.body.lines.length === 2
    && detailRes.body.lines.some((l) => l.description === 'Consulting hours' && Number(l.line_total) === 450)
    && detailRes.body.lines.some((l) => l.description === 'Travel expense reimbursement' && Number(l.line_total) === 50);

  console.log('== GET /invoices/:id ==');
  console.log(JSON.stringify(detailRes.body, null, 2));
  console.log('detailOk:', detailOk);

  // Wrong company / not-found case: bogus id should 404, not 500.
  const notFoundRes = await authed('/invoices/00000000-0000-0000-0000-000000000000');
  const notFoundOk = notFoundRes.status === 404;
  console.log('notFoundOk:', notFoundOk, notFoundRes.status);

  // Unauthenticated request should be rejected.
  const noAuthRes = await req(`/invoices/${invoiceId}`);
  const noAuthOk = noAuthRes.status === 401;
  console.log('noAuthOk:', noAuthOk, noAuthRes.status);

  const ok = detailOk && notFoundOk && noAuthOk;
  console.log(ok ? '== RESULT: PASS ==' : '== RESULT: FAIL ==');
  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
