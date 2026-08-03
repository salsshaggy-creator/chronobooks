// Smoke test for Documents & File Attachments: upload a real file to an invoice, list it,
// download it and check the bytes round-trip, reject an unsupported file type, reject an
// invalid entityType, scope listing correctly to the entity it's attached to, and enforce
// the delete permission (uploader or an admin/accountant/finance-manager role only).
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
  const headers = { Authorization: `Bearer ${adminLogin.accessToken}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  // 1. Create an invoice to attach a receipt to.
  const customer = (await (await fetch(`${base}/api/customers`, { headers: jsonHeaders })).json()).customers[0];
  const invRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-05-10', incomeCategory: 'Sales', lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500 }] }),
  });
  const invoice = await invRes.json();
  const invoiceId = invoice.invoiceId;

  // 2. Upload a text file to it.
  const fileContent = 'Receipt for consulting services — GHS 500.00';
  const form1 = new FormData();
  form1.append('file', new Blob([fileContent], { type: 'text/plain' }), 'receipt.txt');
  form1.append('entityType', 'invoice');
  form1.append('entityId', invoiceId);
  const uploadRes = await fetch(`${base}/api/documents`, { method: 'POST', headers, body: form1 });
  const uploaded = await uploadRes.json();
  const uploadOk = uploadRes.ok && uploaded.fileName === 'receipt.txt' && !!uploaded.id;
  log('uploaded document', { status: uploadRes.status, body: uploaded });

  // 3. It shows up in the list for that entity.
  const listRes = await fetch(`${base}/api/documents?entityType=invoice&entityId=${invoiceId}`, { headers });
  const listBody = await listRes.json();
  const listOk = listBody.documents.length === 1 && listBody.documents[0].file_name === 'receipt.txt' && listBody.documents[0].uploaded_by_name === 'Demo Admin';
  log('list after upload', listBody);

  // 4. A different (unrelated) entityId sees nothing -- scoping actually filters.
  const emptyListRes = await fetch(`${base}/api/documents?entityType=invoice&entityId=nonexistent-id`, { headers });
  const emptyListBody = await emptyListRes.json();
  const scopingOk = emptyListBody.documents.length === 0;

  // 5. Downloading returns the exact original bytes.
  const downloadRes = await fetch(`${base}/api/documents/${uploaded.id}/download`, { headers });
  const downloadedText = await downloadRes.text();
  const downloadOk = downloadRes.ok && downloadedText === fileContent && downloadRes.headers.get('content-disposition').includes('receipt.txt');
  log('download', { status: downloadRes.status, matches: downloadedText === fileContent });

  // 6. An unsupported file type is rejected (never even reaches storage).
  const form2 = new FormData();
  form2.append('file', new Blob(['MZ...'], { type: 'application/x-msdownload' }), 'virus.exe');
  form2.append('entityType', 'invoice');
  form2.append('entityId', invoiceId);
  const badTypeRes = await fetch(`${base}/api/documents`, { method: 'POST', headers, body: form2 });
  const badTypeBlockedOk = badTypeRes.status === 400;
  log('unsupported file type blocked', { status: badTypeRes.status });

  // 7. An invalid entityType is rejected.
  const form3 = new FormData();
  form3.append('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  form3.append('entityType', 'not_a_real_entity');
  form3.append('entityId', invoiceId);
  const badEntityRes = await fetch(`${base}/api/documents`, { method: 'POST', headers, body: form3 });
  const badEntityBlockedOk = badEntityRes.status === 400;

  // 8. A second, low-privilege user (cashier -- not in DOCUMENT_MANAGE_ROLES) can upload
  //    their own file, but can't delete the admin's file above.
  const roles = (await (await fetch(`${base}/api/roles`, { headers })).json()).roles;
  const cashierRole = roles.find((r) => r.code === 'cashier');
  const cashierEmail = `cashier-${Date.now()}@demo-sme.com`;
  const createCashierRes = await fetch(`${base}/api/users`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ firstName: 'Test', lastName: 'Cashier', email: cashierEmail, password: 'Cashier!12345', roleId: cashierRole.id }),
  });
  log('created cashier', { status: createCashierRes.status, body: await createCashierRes.json() });
  const cashierLogin = await login(cashierEmail, 'Cashier!12345');
  const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}` };

  const deleteByOtherRes = await fetch(`${base}/api/documents/${uploaded.id}`, { method: 'DELETE', headers: cashierHeaders });
  const deleteByOtherBlockedOk = deleteByOtherRes.status === 403;
  log('delete by unrelated cashier blocked', { status: deleteByOtherRes.status });

  // 9. The cashier can upload their own file to the same invoice, and delete THAT one themselves.
  const form4 = new FormData();
  form4.append('file', new Blob(['cashier note'], { type: 'text/plain' }), 'note.txt');
  form4.append('entityType', 'invoice');
  form4.append('entityId', invoiceId);
  const cashierUploadRes = await fetch(`${base}/api/documents`, { method: 'POST', headers: cashierHeaders, body: form4 });
  const cashierUpload = await cashierUploadRes.json();
  const cashierUploadOk = cashierUploadRes.ok;

  const selfDeleteRes = await fetch(`${base}/api/documents/${cashierUpload.id}`, { method: 'DELETE', headers: cashierHeaders });
  const selfDeleteOk = selfDeleteRes.ok;

  // 10. But the admin (a DOCUMENT_MANAGE_ROLES role) CAN delete the original file.
  const adminDeleteRes = await fetch(`${base}/api/documents/${uploaded.id}`, { method: 'DELETE', headers });
  const adminDeleteOk = adminDeleteRes.ok;
  const listAfterDeleteRes = await fetch(`${base}/api/documents?entityType=invoice&entityId=${invoiceId}`, { headers });
  const listAfterDelete = await listAfterDeleteRes.json();
  const listAfterDeleteOk = listAfterDelete.documents.length === 0;
  log('after all deletes', listAfterDelete);

  const ok = uploadOk && listOk && scopingOk && downloadOk && badTypeBlockedOk && badEntityBlockedOk
    && deleteByOtherBlockedOk && cashierUploadOk && selfDeleteOk && adminDeleteOk && listAfterDeleteOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`uploadOk=${uploadOk} listOk=${listOk} scopingOk=${scopingOk} downloadOk=${downloadOk} badTypeBlockedOk=${badTypeBlockedOk}`);
  console.log(`badEntityBlockedOk=${badEntityBlockedOk} deleteByOtherBlockedOk=${deleteByOtherBlockedOk} cashierUploadOk=${cashierUploadOk} selfDeleteOk=${selfDeleteOk}`);
  console.log(`adminDeleteOk=${adminDeleteOk} listAfterDeleteOk=${listAfterDeleteOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
