/**
 * Smoke test for customer/supplier edit + delete:
 *  - update should persist the new fields
 *  - delete should succeed for an unreferenced record
 *  - delete should be BLOCKED (400, friendly message) once an invoice/bill references it,
 *    since hard-deleting a customer/supplier out from under a posted transaction would
 *    leave the transaction pointing at nothing.
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

  // --- Customers ---
  const createCustRes = await authed('/customers', { method: 'POST', body: JSON.stringify({ name: 'Temp Customer Co' }) });
  const custId = createCustRes.body.id;

  const updateCustRes = await authed(`/customers/${custId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Renamed Customer Co', email: 'billing@renamed.com', phone: '0555', paymentTerms: 'Net 30', creditLimit: 5000 }),
  });
  const listAfterUpdate = await authed('/customers');
  const updated = listAfterUpdate.body.customers.find((c) => c.id === custId);
  const updateOk = updateCustRes.status === 200 && updated?.name === 'Renamed Customer Co' && updated?.email === 'billing@renamed.com';

  const deleteUnusedCustRes = await authed(`/customers/${custId}`, { method: 'DELETE' });
  const listAfterDelete = await authed('/customers');
  const deleteOk = deleteUnusedCustRes.status === 200 && !listAfterDelete.body.customers.some((c) => c.id === custId);

  // Now block-delete case: a customer with an invoice.
  const customersRes = await authed('/customers');
  const seededCustomerId = customersRes.body.customers[0].id;
  const invRes = await authed('/invoices', {
    method: 'POST',
    body: JSON.stringify({ customerId: seededCustomerId, invoiceDate: '2026-08-01', lines: [{ description: 'Test line', quantity: 1, unitPrice: 100 }] }),
  });
  const blockDeleteRes = await authed(`/customers/${seededCustomerId}`, { method: 'DELETE' });
  const blockDeleteOk = blockDeleteRes.status === 400 && /invoices/i.test(blockDeleteRes.body?.error || '');

  console.log('== Customers ==');
  console.log('updateOk:', updateOk, updated);
  console.log('deleteOk:', deleteOk);
  console.log('blockDeleteOk:', blockDeleteOk, blockDeleteRes.status, blockDeleteRes.body);

  // --- Suppliers ---
  const createSupRes = await authed('/suppliers', { method: 'POST', body: JSON.stringify({ name: 'Temp Supplier Co' }) });
  const supId = createSupRes.body.id;

  const updateSupRes = await authed(`/suppliers/${supId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Renamed Supplier Co', email: 'ap@renamed.com', phone: '0555', paymentTerms: 'Net 15' }),
  });
  const listSupAfterUpdate = await authed('/suppliers');
  const updatedSup = listSupAfterUpdate.body.suppliers.find((s) => s.id === supId);
  const updateSupOk = updateSupRes.status === 200 && updatedSup?.name === 'Renamed Supplier Co' && updatedSup?.email === 'ap@renamed.com';

  const deleteUnusedSupRes = await authed(`/suppliers/${supId}`, { method: 'DELETE' });
  const listSupAfterDelete = await authed('/suppliers');
  const deleteSupOk = deleteUnusedSupRes.status === 200 && !listSupAfterDelete.body.suppliers.some((s) => s.id === supId);

  const suppliersRes = await authed('/suppliers');
  const seededSupplierId = suppliersRes.body.suppliers[0].id;
  const billRes = await authed('/bills', {
    method: 'POST',
    body: JSON.stringify({ supplierId: seededSupplierId, billDate: '2026-08-01', expenseCategory: 'Office Supplies', lines: [{ description: 'Test line', quantity: 1, unitPrice: 100 }] }),
  });
  const blockDeleteSupRes = await authed(`/suppliers/${seededSupplierId}`, { method: 'DELETE' });
  const blockDeleteSupOk = blockDeleteSupRes.status === 400 && /bills/i.test(blockDeleteSupRes.body?.error || '');

  console.log('== Suppliers ==');
  console.log('updateSupOk:', updateSupOk, updatedSup);
  console.log('deleteSupOk:', deleteSupOk);
  console.log('blockDeleteSupOk:', blockDeleteSupOk, blockDeleteSupRes.status, blockDeleteSupRes.body);
  if (billRes.status !== 201) console.log('billRes (context):', billRes.status, billRes.body);

  // Not-found and unauthenticated edge cases (customer side, mirrors supplier code path).
  const notFoundRes = await authed('/customers/00000000-0000-0000-0000-000000000000', { method: 'PUT', body: JSON.stringify({ name: 'X' }) });
  const notFoundOk = notFoundRes.status === 404;
  const noAuthRes = await req(`/customers/${seededCustomerId}`, { method: 'PUT', body: JSON.stringify({ name: 'X' }) });
  const noAuthOk = noAuthRes.status === 401;

  console.log('notFoundOk:', notFoundOk, 'noAuthOk:', noAuthOk);

  const ok = updateOk && deleteOk && blockDeleteOk && updateSupOk && deleteSupOk && blockDeleteSupOk && notFoundOk && noAuthOk;
  console.log(ok ? '== RESULT: PASS ==' : '== RESULT: FAIL ==');
  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
