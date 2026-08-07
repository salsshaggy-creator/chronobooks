import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import Attachments from '../components/Attachments';
import { downloadCSV, downloadPDF } from '../utils/export';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '', itemId: '' });

export default function Sales() {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [currencies, setCurrencies] = useState([]);
  const [costCentresEnabled, setCostCentresEnabled] = useState(false);
  const [costCentres, setCostCentres] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customerId: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    incomeCategory: 'Sales',
    taxRatePercent: 0,
    currency: '',
    exchangeRate: '',
    costCentreId: '',
    lines: [emptyLine()],
  });

  const [receiptFor, setReceiptFor] = useState(null); // invoice id currently receiving payment
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [invoiceDetail, setInvoiceDetail] = useState({}); // invoiceId -> { invoice, lines }, fetched lazily on expand
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [newCustomerError, setNewCustomerError] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  const [voidConfirmId, setVoidConfirmId] = useState(null);
  const [voidingId, setVoidingId] = useState(null);
  const [voidError, setVoidError] = useState({});

  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState({ name: '', email: '', phone: '' });
  const [editCustomerError, setEditCustomerError] = useState('');
  const [editCustomerSaving, setEditCustomerSaving] = useState(false);
  const [deleteCustomerConfirm, setDeleteCustomerConfirm] = useState(false);
  const [deleteCustomerError, setDeleteCustomerError] = useState('');
  const [deleteCustomerSaving, setDeleteCustomerSaving] = useState(false);

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [statementData, setStatementData] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');

  function load() {
    api.listCustomers().then((r) => {
      setCustomers(r.customers);
      setForm((f) => (f.customerId ? f : { ...f, customerId: r.customers[0]?.id || '' }));
    }).catch((err) => setError(err.message));
    api.listInvoices().then((r) => setInvoices(r.invoices)).catch((err) => setError(err.message));
    api.getCompany().then((c) => {
      setInventoryEnabled(!!c.inventoryEnabled);
      setMultiCurrencyEnabled(!!c.multiCurrencyEnabled);
      setBaseCurrency(c.currency || 'GHS');
      setCostCentresEnabled(!!c.costCentresEnabled);
      setForm((f) => (f.currency ? f : { ...f, currency: c.currency || 'GHS' }));
    }).catch(() => {});
    api.listInventoryItems().then((r) => setItems(r.items.filter((i) => i.is_active))).catch(() => {});
    api.listCurrencies().then((r) => setCurrencies(r.currencies)).catch(() => {});
    api.listCostCentres().then((r) => setCostCentres(r.costCentres)).catch(() => {});
  }

  useEffect(load, []);

  function updateLine(index, field, value) {
    const lines = form.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l));
    setForm({ ...form, lines });
  }

  function removeLine(index) {
    if (form.lines.length <= 1) return; // always keep at least one line
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });
  }

  function pickItemForLine(index, itemId) {
    const item = items.find((i) => i.id === itemId);
    const lines = form.lines.map((l, i) => (i === index
      ? { ...l, itemId, description: item ? item.name : l.description, unitPrice: item ? (item.sale_price ?? item.cost_price) : l.unitPrice }
      : l));
    setForm({ ...form, lines });
  }

  const subtotal = form.lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const isForeign = multiCurrencyEnabled && form.currency && form.currency !== baseCurrency;
  const previewRate = Number(form.exchangeRate) || 0;
  const previewBaseTotal = isForeign && previewRate > 0 ? subtotal * previewRate : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!isForeign) { delete payload.currency; delete payload.exchangeRate; }
      else if (!payload.exchangeRate) delete payload.exchangeRate;
      const result = await api.createInvoice(payload);
      setForm((f) => ({ ...f, dueDate: '', lines: [emptyLine()] }));
      if (result.pendingApproval) setNotice(result.message);
      else if (result.foreignTotal != null) setNotice(`Posted as ${currency(result.total)} (${result.currency} ${Number(result.foreignTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} at rate ${result.exchangeRate}).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCustomer(e) {
    e.preventDefault();
    setNewCustomerError('');
    if (!newCustomer.name.trim()) { setNewCustomerError('Customer name is required.'); return; }
    setNewCustomerSaving(true);
    try {
      const result = await api.createCustomer({ name: newCustomer.name.trim(), email: newCustomer.email || undefined, phone: newCustomer.phone || undefined });
      const r = await api.listCustomers();
      setCustomers(r.customers);
      setForm((f) => ({ ...f, customerId: result.id }));
      setNewCustomer({ name: '', email: '', phone: '' });
      setNewCustomerOpen(false);
    } catch (err) {
      setNewCustomerError(err.message);
    } finally {
      setNewCustomerSaving(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  function openEditCustomer() {
    if (!selectedCustomer) return;
    setEditCustomer({ name: selectedCustomer.name || '', email: selectedCustomer.email || '', phone: selectedCustomer.phone || '' });
    setEditCustomerError('');
    setEditCustomerOpen(true);
    setDeleteCustomerConfirm(false);
  }

  async function handleUpdateCustomer(e) {
    e.preventDefault();
    setEditCustomerError('');
    if (!editCustomer.name.trim()) { setEditCustomerError('Customer name is required.'); return; }
    setEditCustomerSaving(true);
    try {
      await api.updateCustomer(form.customerId, {
        name: editCustomer.name.trim(),
        email: editCustomer.email || undefined,
        phone: editCustomer.phone || undefined,
      });
      setEditCustomerOpen(false);
      load();
    } catch (err) {
      setEditCustomerError(err.message);
    } finally {
      setEditCustomerSaving(false);
    }
  }

  async function handleDeleteCustomer() {
    setDeleteCustomerError('');
    setDeleteCustomerSaving(true);
    try {
      await api.deleteCustomer(form.customerId);
      setDeleteCustomerConfirm(false);
      setForm((f) => ({ ...f, customerId: '' }));
      load();
    } catch (err) {
      setDeleteCustomerError(err.message);
    } finally {
      setDeleteCustomerSaving(false);
    }
  }

  // Fetches and shows the selected customer's statement (their receivable ledger: every
  // invoice and every receipt, running balance). Re-fetches whenever the date range changes.
  async function openStatement() {
    if (!selectedCustomer) return;
    setStatementOpen(true);
    setStatementError('');
    setStatementLoading(true);
    try {
      const data = await api.getCustomerStatement(form.customerId, { from: statementFrom, to: statementTo });
      setStatementData(data);
    } catch (err) {
      setStatementError(err.message);
    } finally {
      setStatementLoading(false);
    }
  }

  function handleDownloadStatement(format) {
    if (!statementData || !selectedCustomer) return;
    const rangeLabel = statementFrom || statementTo ? `${statementFrom || 'start'} to ${statementTo || 'today'}` : 'Full history';
    const columns = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = statementData.transactions.map((t) => [t.date, t.description, t.debit ? currency(t.debit) : '', t.credit ? currency(t.credit) : '', currency(t.balance)]);
    const filename = `Statement-${selectedCustomer.name.replace(/[^a-z0-9]+/gi, '-')}`;
    if (format === 'pdf') {
      downloadPDF(`${filename}.pdf`, {
        title: 'Customer Statement',
        subtitle: selectedCustomer.name,
        meta: [rangeLabel, `Opening balance: ${currency(statementData.openingBalance)}`],
        columns,
        rows,
        summary: [`Closing balance: ${currency(statementData.closingBalance)}`],
      });
    } else {
      downloadCSV(`${filename}.csv`, [
        ['Statement for', selectedCustomer.name],
        ['Period', rangeLabel],
        ['Opening balance', statementData.openingBalance],
        [],
        columns,
        ...statementData.transactions.map((t) => [t.date, t.description, t.debit || '', t.credit || '', t.balance]),
        [],
        ['Closing balance', statementData.closingBalance],
      ]);
    }
  }

  async function handleVoidInvoice(id) {
    setVoidingId(id);
    setVoidError((e) => ({ ...e, [id]: '' }));
    try {
      await api.voidInvoice(id);
      setVoidConfirmId(null);
      load();
    } catch (err) {
      setVoidError((e) => ({ ...e, [id]: err.message }));
    } finally {
      setVoidingId(null);
    }
  }

  async function handleReceipt(invoiceId) {
    setReceiptError('');
    setNotice('');
    try {
      const result = await api.createReceipt({
        invoiceId,
        receiptDate: new Date().toISOString().slice(0, 10),
        depositedToAccountCode: '1010',
        amount: Number(receiptAmount),
        paymentMethod: 'Bank transfer',
      });
      setReceiptFor(null);
      setReceiptAmount('');
      if (result.pendingApproval) setNotice(result.message);
      // Drop the cached detail so re-expanding this invoice re-fetches it with the new receipt.
      setInvoiceDetail((m) => { const n = { ...m }; delete n[invoiceId]; return n; });
      load();
    } catch (err) {
      setReceiptError(err.message);
    }
  }

  // Fetches an invoice's line items once and caches them by id -- shared by the expanded
  // detail row and the CSV download so neither refetches what the other already has.
  async function fetchInvoiceDetail(id) {
    if (invoiceDetail[id]) return invoiceDetail[id];
    const detail = await api.getInvoice(id);
    setInvoiceDetail((m) => ({ ...m, [id]: detail }));
    return detail;
  }

  async function toggleExpand(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!invoiceDetail[id]) {
      setLoadingDetailId(id);
      try { await fetchInvoiceDetail(id); } catch (err) { setError(err.message); } finally { setLoadingDetailId(null); }
    }
  }

  // Downloads an invoice as CSV (opens directly in Excel/Sheets) or PDF -- both built entirely
  // client-side from the same cached detail fetch, so neither format needs a server round trip.
  async function handleDownloadInvoice(inv, format) {
    setDownloadingId(inv.id);
    setError('');
    try {
      const detail = await fetchInvoiceDetail(inv.id);
      const outstanding = Number(detail.invoice.total) - Number(detail.invoice.paid);
      const columns = ['Description', 'Quantity', 'Unit Price', 'Line Total'];
      const lineRows = detail.lines.map((l) => [l.description, l.quantity, currency(l.unit_price), currency(l.line_total)]);
      if (format === 'pdf') {
        downloadPDF(`${detail.invoice.invoice_number}.pdf`, {
          title: 'Invoice',
          subtitle: detail.invoice.invoice_number,
          meta: [
            `Customer: ${detail.invoice.customer_name}`,
            `Date: ${detail.invoice.invoice_date}${detail.invoice.due_date ? `  ·  Due: ${detail.invoice.due_date}` : ''}`,
            `Status: ${detail.invoice.status}`,
          ],
          columns,
          rows: lineRows,
          summary: [
            `Total: ${currency(detail.invoice.total)}`,
            `Paid: ${currency(detail.invoice.paid)}`,
            `Outstanding: ${currency(outstanding)}`,
          ],
        });
      } else {
        downloadCSV(`${detail.invoice.invoice_number}.csv`, [
          ['Invoice', detail.invoice.invoice_number],
          ['Customer', detail.invoice.customer_name],
          ['Date', detail.invoice.invoice_date],
          ['Due date', detail.invoice.due_date || ''],
          ['Status', detail.invoice.status],
          ['Total', detail.invoice.total],
          ['Paid', detail.invoice.paid],
          ['Outstanding', outstanding],
          [],
          columns,
          ...detail.lines.map((l) => [l.description, l.quantity, l.unit_price, l.line_total]),
        ]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  // Downloads a receipt as CSV or PDF -- receipts are simple enough (one payment against one
  // invoice) that no detail fetch is needed; everything is already in the invoice's payload.
  function handleDownloadReceipt(inv, receipt, format) {
    const filename = `Receipt-${receipt.id}-${inv.invoice_number}`;
    const meta = [
      `Invoice: ${inv.invoice_number}`,
      `Customer: ${inv.customer_name}`,
      `Date: ${receipt.receipt_date}`,
      `Method: ${receipt.payment_method || ''}`,
    ];
    if (format === 'pdf') {
      downloadPDF(`${filename}.pdf`, {
        title: 'Receipt',
        subtitle: `Payment received for ${inv.invoice_number}`,
        meta,
        summary: [`Amount received: ${currency(receipt.amount)}`],
      });
    } else {
      downloadCSV(`${filename}.csv`, [
        ['Receipt for invoice', inv.invoice_number],
        ['Customer', inv.customer_name],
        ['Date', receipt.receipt_date],
        ['Method', receipt.payment_method || ''],
        ['Amount received', receipt.amount],
      ]);
    }
  }

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Raise invoice</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>
          Pick a customer and list what you sold — Accounts Receivable and Sales post automatically.
        </div>

        <label style={labelStyle}>
          Customer
          <select
            value={form.customerId}
            onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            style={inputStyle}
            required={customers.length > 0}
            disabled={customers.length === 0}
          >
            {customers.length === 0 && <option value="">No customers yet — add one below</option>}
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setNewCustomerOpen(true)}
            style={ghostButtonStyle}
          >
            + Add new customer
          </button>
          {selectedCustomer && (
            <>
              <button type="button" onClick={openEditCustomer} style={ghostButtonStyle}>
                ✎ Edit
              </button>
              <button
                type="button"
                onClick={() => { setDeleteCustomerConfirm(true); setEditCustomerOpen(false); setDeleteCustomerError(''); }}
                style={{ ...ghostButtonStyle, color: 'var(--cb-danger)' }}
              >
                🗑 Delete
              </button>
              <button type="button" onClick={openStatement} style={ghostButtonStyle}>
                📄 Statement
              </button>
            </>
          )}
        </div>

        {statementOpen && selectedCustomer && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Statement — {selectedCustomer.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ ...labelStyle, flex: 1 }}>
                From
                <input type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: 1 }}>
                To
                <input type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} style={inputStyle} />
              </label>
            </div>
            <button type="button" onClick={openStatement} disabled={statementLoading} style={{ ...buttonStyle, marginTop: 0 }}>
              {statementLoading ? 'Loading…' : 'Refresh'}
            </button>
            {statementError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{statementError}</div>}
            {statementData && (
              <>
                <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>Opening balance: {currency(statementData.openingBalance)}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                      <th style={{ padding: '4px 6px' }}>Date</th>
                      <th style={{ padding: '4px 6px' }}>Description</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Debit</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Credit</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.transactions.map((t, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--cb-border)' }}>
                        <td style={{ padding: '4px 6px' }}>{t.date}</td>
                        <td style={{ padding: '4px 6px' }}>{t.description}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{t.debit ? currency(t.debit) : ''}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{t.credit ? currency(t.credit) : ''}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{currency(t.balance)}</td>
                      </tr>
                    ))}
                    {statementData.transactions.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '8px 6px', color: 'var(--cb-text-secondary)' }}>No activity in this period.</td></tr>
                    )}
                  </tbody>
                </table>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Closing balance: {currency(statementData.closingBalance)}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => handleDownloadStatement('csv')} style={{ ...ghostButtonStyle, flex: 1 }}>Download CSV</button>
                  <button type="button" onClick={() => handleDownloadStatement('pdf')} style={{ ...ghostButtonStyle, flex: 1 }}>Download PDF</button>
                </div>
              </>
            )}
            <button type="button" onClick={() => setStatementOpen(false)} style={ghostButtonStyle}>Close</button>
          </div>
        )}

        {deleteCustomerConfirm && selectedCustomer && (
          <div style={{ border: '1px solid var(--cb-danger)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              Delete <strong>{selectedCustomer.name}</strong>? This can’t be undone.
              {' '}Customers with invoices on record can’t be deleted — edit their details instead.
            </div>
            {deleteCustomerError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{deleteCustomerError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleDeleteCustomer} disabled={deleteCustomerSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1, background: 'var(--cb-danger)', color: '#fff' }}>
                {deleteCustomerSaving ? 'Deleting…' : 'Delete customer'}
              </button>
              <button type="button" onClick={() => setDeleteCustomerConfirm(false)} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {editCustomerOpen && selectedCustomer && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Edit customer</div>
            <label style={labelStyle}>
              Name
              <input value={editCustomer.name} onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Email (optional)
              <input type="email" value={editCustomer.email} onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Phone (optional)
              <input value={editCustomer.phone} onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })} style={inputStyle} />
            </label>
            {editCustomerError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{editCustomerError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleUpdateCustomer} disabled={editCustomerSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1 }}>
                {editCustomerSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setEditCustomerOpen(false)} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {newCustomerOpen && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>New customer</div>
            <label style={labelStyle}>
              Name
              <input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Customer name" style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Email (optional)
              <input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="customer@email.com" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Phone (optional)
              <input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="Phone number" style={inputStyle} />
            </label>
            {newCustomerError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{newCustomerError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleCreateCustomer} disabled={newCustomerSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1 }}>
                {newCustomerSaving ? 'Saving…' : 'Save customer'}
              </button>
              <button type="button" onClick={() => { setNewCustomerOpen(false); setNewCustomerError(''); }} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <label style={labelStyle}>
          Invoice date
          <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} style={inputStyle} required />
        </label>

        <label style={labelStyle}>
          Due date
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} style={inputStyle} />
        </label>

        {costCentresEnabled && costCentres.length > 0 && (
          <label style={labelStyle}>
            Cost centre
            <select value={form.costCentreId} onChange={(e) => setForm({ ...form, costCentreId: e.target.value })} style={inputStyle}>
              <option value="">— none —</option>
              {costCentres.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
            </select>
          </label>
        )}

        {multiCurrencyEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: isForeign ? '1fr 1fr' : '1fr', gap: 6 }}>
            <label style={labelStyle}>
              Currency
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, exchangeRate: '' })} style={inputStyle}>
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            {isForeign && (
              <label style={labelStyle}>
                Rate to {baseCurrency} (blank = use Parameters)
                <input type="number" min="0" step="0.0001" placeholder="auto" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} style={inputStyle} />
              </label>
            )}
          </div>
        )}
        {isForeign && previewBaseTotal != null && (
          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>≈ {currency(previewBaseTotal)} at rate {previewRate}</div>
        )}

        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4 }}>
          Line items{items.length > 0 && ' — pick an item to autofill it, issue stock, and post Cost of Goods Sold'}
          {isForeign && ` — amounts in ${form.currency}`}
        </div>
        {form.lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.length > 0 && (
              <select value={line.itemId} onChange={(e) => pickItemForLine(i, e.target.value)} style={inputStyle}>
                <option value="">No stock item (freeform line)</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''} — {Number(it.quantity_on_hand).toLocaleString()} on hand</option>)}
              </select>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px 24px', gap: 6, alignItems: 'center' }}>
              <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={inputStyle} required disabled={!!line.itemId} />
              <input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={inputStyle} />
              <input type="number" min="0" step="0.01" placeholder="Price" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={inputStyle} required />
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={form.lines.length <= 1}
                title="Remove line"
                style={{ border: 'none', background: 'transparent', color: form.lines.length <= 1 ? 'var(--cb-border)' : 'var(--cb-danger)', fontSize: 16, fontWeight: 700, cursor: form.lines.length <= 1 ? 'default' : 'pointer', padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} style={ghostButtonStyle}>
          + Add line
        </button>

        <label style={labelStyle}>
          Tax rate (%)
          <input type="number" min="0" step="0.5" value={form.taxRatePercent} onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })} style={inputStyle} />
        </label>

        <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--cb-border)' }}>
          <span style={{ color: 'var(--cb-text-secondary)' }}>Subtotal</span>
          <span style={{ fontWeight: 600 }}>{isForeign ? `${form.currency} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : currency(subtotal)}</span>
        </div>

        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
        {notice && <div style={{ color: 'var(--cb-amber-600)', fontSize: 13, background: '#faeeda', borderRadius: 8, padding: '8px 10px' }}>⏳ {notice}</div>}

        <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Raise invoice'}</button>
      </form>

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Invoices</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Invoice</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Date</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const outstanding = Number(inv.total) - Number(inv.paid);
              return (
              <Fragment key={inv.id}>
                <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>{inv.invoice_number}</td>
                  <td style={tdStyle}>{inv.customer_name}</td>
                  <td style={tdStyle}>{inv.invoice_date}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {currency(inv.total)}
                    {inv.currency && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{inv.currency} {Number(inv.foreign_total).toLocaleString(undefined, { minimumFractionDigits: 2 })} @ {inv.exchange_rate}</div>}
                    {inv.cost_centre_code && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{inv.cost_centre_code}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(outstanding)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: inv.status === 'paid' ? '#e1f5ee' : '#faeeda', color: inv.status === 'paid' ? '#085041' : '#854f0b' }}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {outstanding > 0 && (
                      receiptFor === inv.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={outstanding}
                            placeholder="Amount"
                            value={receiptAmount}
                            onChange={(e) => setReceiptAmount(e.target.value)}
                            style={{ ...inputStyle, width: 80, marginTop: 0 }}
                          />
                          <button type="button" onClick={() => handleReceipt(inv.id)} style={{ ...buttonStyle, marginTop: 0, padding: '6px 10px' }}>Save</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setReceiptFor(inv.id); setReceiptAmount(String(outstanding)); }} style={ghostButtonStyle}>
                          Record receipt
                        </button>
                      )
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => toggleExpand(inv.id)} style={ghostButtonStyle} title="Details & attachments">
                      {expandedId === inv.id ? '▲' : '▾'} Details
                    </button>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => handleDownloadInvoice(inv, 'csv')} disabled={downloadingId === inv.id} style={ghostButtonStyle} title="Download as CSV (opens in Excel)">
                        {downloadingId === inv.id ? '…' : 'CSV'}
                      </button>
                      <button type="button" onClick={() => handleDownloadInvoice(inv, 'pdf')} disabled={downloadingId === inv.id} style={ghostButtonStyle} title="Download as PDF">
                        {downloadingId === inv.id ? '…' : 'PDF'}
                      </button>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {inv.status === 'void' ? (
                      <span style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>—</span>
                    ) : voidConfirmId === inv.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" onClick={() => handleVoidInvoice(inv.id)} disabled={voidingId === inv.id} style={{ ...ghostButtonStyle, color: 'var(--cb-danger)' }}>
                            {voidingId === inv.id ? 'Voiding…' : 'Confirm void'}
                          </button>
                          <button type="button" onClick={() => setVoidConfirmId(null)} style={ghostButtonStyle}>Cancel</button>
                        </div>
                        {voidError[inv.id] && <div style={{ color: 'var(--cb-danger)', fontSize: 10.5, maxWidth: 220 }}>{voidError[inv.id]}</div>}
                      </div>
                    ) : (
                      <button type="button" onClick={() => setVoidConfirmId(inv.id)} style={{ ...ghostButtonStyle, color: 'var(--cb-danger)' }} title="Void this invoice">
                        Void
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === inv.id && (
                  <tr>
                    <td colSpan={10} style={{ padding: '0 0 14px' }}>
                      {loadingDetailId === inv.id ? (
                        <div style={{ fontSize: 12.5, color: 'var(--cb-text-secondary)', padding: '8px 0' }}>Loading line items…</div>
                      ) : invoiceDetail[inv.id] ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: 'var(--cb-bg)', borderRadius: 8, marginBottom: 10 }}>
                          <thead>
                            <tr style={{ color: 'var(--cb-text-secondary)' }}>
                              <th style={{ ...thStyle, padding: '6px 10px' }}>Description</th>
                              <th style={{ ...thStyle, padding: '6px 10px', textAlign: 'right' }}>Qty</th>
                              <th style={{ ...thStyle, padding: '6px 10px', textAlign: 'right' }}>Unit Price</th>
                              <th style={{ ...thStyle, padding: '6px 10px', textAlign: 'right' }}>Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoiceDetail[inv.id].lines.map((l) => (
                              <tr key={l.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                                <td style={{ padding: '6px 10px' }}>{l.description}{l.item_name && l.item_name !== l.description ? ` (${l.item_name})` : ''}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{l.quantity}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{currency(l.unit_price)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{currency(l.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                      {invoiceDetail[inv.id]?.receipts?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cb-text-secondary)', marginBottom: 4 }}>Payments received</div>
                          {invoiceDetail[inv.id].receipts.map((r) => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '4px 10px' }}>
                              <span style={{ flex: 1 }}>{r.receipt_date} — {currency(r.amount)}{r.payment_method ? ` (${r.payment_method})` : ''}</span>
                              <button type="button" onClick={() => handleDownloadReceipt(inv, r, 'csv')} style={ghostButtonStyle} title="Download receipt as CSV">CSV</button>
                              <button type="button" onClick={() => handleDownloadReceipt(inv, r, 'pdf')} style={ghostButtonStyle} title="Download receipt as PDF">PDF</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Attachments entityType="invoice" entityId={inv.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {receiptError && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 8 }}>{receiptError}</div>}
        {notice && <div style={{ color: 'var(--cb-amber-600)', fontSize: 13, marginTop: 8, background: '#faeeda', borderRadius: 8, padding: '8px 10px' }}>⏳ {notice}</div>}
        {invoices.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No invoices yet.</div>}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { marginTop: 6, padding: '10px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 14 };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
