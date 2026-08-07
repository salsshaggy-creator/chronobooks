import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import Attachments from '../components/Attachments';
import { downloadCSV, downloadPDF } from '../utils/export';

const CATEGORIES = ['Inventory', 'Fuel', 'Utilities', 'Rent', 'Office Supplies', 'Marketing', 'Bank Charges', 'Miscellaneous'];
const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '', itemId: '' });

export default function Purchases() {
  const [suppliers, setSuppliers] = useState([]);
  const [bills, setBills] = useState([]);
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
    supplierId: '',
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    expenseCategory: 'Office Supplies',
    taxRatePercent: 0,
    currency: '',
    exchangeRate: '',
    costCentreId: '',
    lines: [emptyLine()],
  });

  const [paymentFor, setPaymentFor] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [billDetail, setBillDetail] = useState({}); // billId -> { bill, lines, payments }, fetched lazily
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const [voidConfirmId, setVoidConfirmId] = useState(null);
  const [voidingId, setVoidingId] = useState(null);
  const [voidError, setVoidError] = useState({});

  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', email: '', phone: '' });
  const [newSupplierError, setNewSupplierError] = useState('');
  const [newSupplierSaving, setNewSupplierSaving] = useState(false);

  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState({ name: '', email: '', phone: '' });
  const [editSupplierError, setEditSupplierError] = useState('');
  const [editSupplierSaving, setEditSupplierSaving] = useState(false);
  const [deleteSupplierConfirm, setDeleteSupplierConfirm] = useState(false);
  const [deleteSupplierError, setDeleteSupplierError] = useState('');
  const [deleteSupplierSaving, setDeleteSupplierSaving] = useState(false);

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [statementData, setStatementData] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');

  const isStockReceipt = form.expenseCategory === 'Inventory';

  function load() {
    api.listSuppliers().then((r) => {
      setSuppliers(r.suppliers);
      setForm((f) => (f.supplierId ? f : { ...f, supplierId: r.suppliers[0]?.id || '' }));
    }).catch((err) => setError(err.message));
    api.listBills().then((r) => setBills(r.bills)).catch((err) => setError(err.message));
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
      ? { ...l, itemId, description: item ? item.name : l.description, unitPrice: item ? item.cost_price : l.unitPrice }
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
      const result = await api.createBill(payload);
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

  async function handleCreateSupplier(e) {
    e.preventDefault();
    setNewSupplierError('');
    if (!newSupplier.name.trim()) { setNewSupplierError('Supplier name is required.'); return; }
    setNewSupplierSaving(true);
    try {
      const result = await api.createSupplier({ name: newSupplier.name.trim(), email: newSupplier.email || undefined, phone: newSupplier.phone || undefined });
      const r = await api.listSuppliers();
      setSuppliers(r.suppliers);
      setForm((f) => ({ ...f, supplierId: result.id }));
      setNewSupplier({ name: '', email: '', phone: '' });
      setNewSupplierOpen(false);
    } catch (err) {
      setNewSupplierError(err.message);
    } finally {
      setNewSupplierSaving(false);
    }
  }

  const selectedSupplier = suppliers.find((s) => s.id === form.supplierId);

  function openEditSupplier() {
    if (!selectedSupplier) return;
    setEditSupplier({ name: selectedSupplier.name || '', email: selectedSupplier.email || '', phone: selectedSupplier.phone || '' });
    setEditSupplierError('');
    setEditSupplierOpen(true);
    setDeleteSupplierConfirm(false);
  }

  async function handleUpdateSupplier(e) {
    e.preventDefault();
    setEditSupplierError('');
    if (!editSupplier.name.trim()) { setEditSupplierError('Supplier name is required.'); return; }
    setEditSupplierSaving(true);
    try {
      await api.updateSupplier(form.supplierId, {
        name: editSupplier.name.trim(),
        email: editSupplier.email || undefined,
        phone: editSupplier.phone || undefined,
      });
      setEditSupplierOpen(false);
      load();
    } catch (err) {
      setEditSupplierError(err.message);
    } finally {
      setEditSupplierSaving(false);
    }
  }

  async function handleDeleteSupplier() {
    setDeleteSupplierError('');
    setDeleteSupplierSaving(true);
    try {
      await api.deleteSupplier(form.supplierId);
      setDeleteSupplierConfirm(false);
      setForm((f) => ({ ...f, supplierId: '' }));
      load();
    } catch (err) {
      setDeleteSupplierError(err.message);
    } finally {
      setDeleteSupplierSaving(false);
    }
  }

  // Fetches and shows the selected supplier's statement (their payable ledger: every bill
  // and every payment, running balance). Re-fetches whenever the date range changes.
  async function openStatement() {
    if (!selectedSupplier) return;
    setStatementOpen(true);
    setStatementError('');
    setStatementLoading(true);
    try {
      const data = await api.getSupplierStatement(form.supplierId, { from: statementFrom, to: statementTo });
      setStatementData(data);
    } catch (err) {
      setStatementError(err.message);
    } finally {
      setStatementLoading(false);
    }
  }

  function handleDownloadStatement(format) {
    if (!statementData || !selectedSupplier) return;
    const rangeLabel = statementFrom || statementTo ? `${statementFrom || 'start'} to ${statementTo || 'today'}` : 'Full history';
    const columns = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = statementData.transactions.map((t) => [t.date, t.description, t.debit ? currency(t.debit) : '', t.credit ? currency(t.credit) : '', currency(t.balance)]);
    const filename = `Statement-${selectedSupplier.name.replace(/[^a-z0-9]+/gi, '-')}`;
    if (format === 'pdf') {
      downloadPDF(`${filename}.pdf`, {
        title: 'Supplier Statement',
        subtitle: selectedSupplier.name,
        meta: [rangeLabel, `Opening balance: ${currency(statementData.openingBalance)}`],
        columns,
        rows,
        summary: [`Closing balance: ${currency(statementData.closingBalance)}`],
      });
    } else {
      downloadCSV(`${filename}.csv`, [
        ['Statement for', selectedSupplier.name],
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

  async function handleVoidBill(id) {
    setVoidingId(id);
    setVoidError((e) => ({ ...e, [id]: '' }));
    try {
      await api.voidBill(id);
      setVoidConfirmId(null);
      load();
    } catch (err) {
      setVoidError((e) => ({ ...e, [id]: err.message }));
    } finally {
      setVoidingId(null);
    }
  }

  async function handlePayment(billId) {
    setPaymentError('');
    try {
      await api.createSupplierPayment({
        billId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paidFromAccountCode: '1010',
        amount: Number(paymentAmount),
        paymentMethod: 'Bank transfer',
      });
      setPaymentFor(null);
      setPaymentAmount('');
      // Drop the cached detail so re-expanding this bill re-fetches it with the new payment.
      setBillDetail((m) => { const n = { ...m }; delete n[billId]; return n; });
      load();
    } catch (err) {
      setPaymentError(err.message);
    }
  }

  // Fetches a bill's line items + payments once and caches them by id -- shared by the
  // expanded detail view and the CSV/PDF download so neither refetches what the other has.
  async function fetchBillDetail(id) {
    if (billDetail[id]) return billDetail[id];
    const detail = await api.getBill(id);
    setBillDetail((m) => ({ ...m, [id]: detail }));
    return detail;
  }

  async function toggleExpand(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!billDetail[id]) {
      setLoadingDetailId(id);
      try { await fetchBillDetail(id); } catch (err) { setError(err.message); } finally { setLoadingDetailId(null); }
    }
  }

  // Downloads a bill as CSV (opens directly in Excel/Sheets) or PDF -- both built entirely
  // client-side from the same cached detail fetch, so neither format needs a server round trip.
  async function handleDownloadBill(bill, format) {
    setDownloadingId(bill.id);
    setError('');
    try {
      const detail = await fetchBillDetail(bill.id);
      const outstanding = Number(detail.bill.total) - Number(detail.bill.paid);
      const columns = ['Description', 'Quantity', 'Unit Price', 'Line Total'];
      const lineRows = detail.lines.map((l) => [l.description, l.quantity, currency(l.unit_price), currency(l.line_total)]);
      if (format === 'pdf') {
        downloadPDF(`${detail.bill.bill_number}.pdf`, {
          title: 'Bill',
          subtitle: detail.bill.bill_number,
          meta: [
            `Supplier: ${detail.bill.supplier_name}`,
            `Date: ${detail.bill.bill_date}${detail.bill.due_date ? `  ·  Due: ${detail.bill.due_date}` : ''}`,
            `Status: ${detail.bill.status}`,
          ],
          columns,
          rows: lineRows,
          summary: [
            `Total: ${currency(detail.bill.total)}`,
            `Paid: ${currency(detail.bill.paid)}`,
            `Outstanding: ${currency(outstanding)}`,
          ],
        });
      } else {
        downloadCSV(`${detail.bill.bill_number}.csv`, [
          ['Bill', detail.bill.bill_number],
          ['Supplier', detail.bill.supplier_name],
          ['Date', detail.bill.bill_date],
          ['Due date', detail.bill.due_date || ''],
          ['Status', detail.bill.status],
          ['Total', detail.bill.total],
          ['Paid', detail.bill.paid],
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

  // Downloads a supplier payment as CSV or PDF -- a payment is simple enough (one amount
  // against one bill) that everything needed is already on the record itself.
  function handleDownloadPayment(bill, payment, format) {
    const filename = `Payment-${payment.id}-${bill.bill_number}`;
    const meta = [
      `Bill: ${bill.bill_number}`,
      `Supplier: ${bill.supplier_name}`,
      `Date: ${payment.payment_date}`,
      `Method: ${payment.payment_method || ''}`,
    ];
    if (format === 'pdf') {
      downloadPDF(`${filename}.pdf`, {
        title: 'Payment',
        subtitle: `Payment made for ${bill.bill_number}`,
        meta,
        summary: [`Amount paid: ${currency(payment.amount)}`],
      });
    } else {
      downloadCSV(`${filename}.csv`, [
        ['Payment for bill', bill.bill_number],
        ['Supplier', bill.supplier_name],
        ['Date', payment.payment_date],
        ['Method', payment.payment_method || ''],
        ['Amount paid', payment.amount],
      ]);
    }
  }

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Record supplier bill</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>
          Pick a supplier and what the bill is for — Accounts Payable posts automatically.
        </div>

        <label style={labelStyle}>
          Supplier
          <select
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            style={inputStyle}
            required={suppliers.length > 0}
            disabled={suppliers.length === 0}
          >
            {suppliers.length === 0 && <option value="">No suppliers yet — add one below</option>}
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setNewSupplierOpen(true)}
            style={ghostButtonStyle}
          >
            + Add new supplier
          </button>
          {selectedSupplier && (
            <>
              <button type="button" onClick={openEditSupplier} style={ghostButtonStyle}>
                ✎ Edit
              </button>
              <button
                type="button"
                onClick={() => { setDeleteSupplierConfirm(true); setEditSupplierOpen(false); setDeleteSupplierError(''); }}
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

        {statementOpen && selectedSupplier && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Statement — {selectedSupplier.name}</div>
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

        {deleteSupplierConfirm && selectedSupplier && (
          <div style={{ border: '1px solid var(--cb-danger)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              Delete <strong>{selectedSupplier.name}</strong>? This can’t be undone.
              {' '}Suppliers with bills on record can’t be deleted — edit their details instead.
            </div>
            {deleteSupplierError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{deleteSupplierError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleDeleteSupplier} disabled={deleteSupplierSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1, background: 'var(--cb-danger)', color: '#fff' }}>
                {deleteSupplierSaving ? 'Deleting…' : 'Delete supplier'}
              </button>
              <button type="button" onClick={() => setDeleteSupplierConfirm(false)} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {editSupplierOpen && selectedSupplier && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Edit supplier</div>
            <label style={labelStyle}>
              Name
              <input value={editSupplier.name} onChange={(e) => setEditSupplier({ ...editSupplier, name: e.target.value })} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Email (optional)
              <input type="email" value={editSupplier.email} onChange={(e) => setEditSupplier({ ...editSupplier, email: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Phone (optional)
              <input value={editSupplier.phone} onChange={(e) => setEditSupplier({ ...editSupplier, phone: e.target.value })} style={inputStyle} />
            </label>
            {editSupplierError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{editSupplierError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleUpdateSupplier} disabled={editSupplierSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1 }}>
                {editSupplierSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setEditSupplierOpen(false)} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {newSupplierOpen && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>New supplier</div>
            <label style={labelStyle}>
              Name
              <input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="Supplier name" style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Email (optional)
              <input type="email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} placeholder="supplier@email.com" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Phone (optional)
              <input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} placeholder="Phone number" style={inputStyle} />
            </label>
            {newSupplierError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{newSupplierError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleCreateSupplier} disabled={newSupplierSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1 }}>
                {newSupplierSaving ? 'Saving…' : 'Save supplier'}
              </button>
              <button type="button" onClick={() => { setNewSupplierOpen(false); setNewSupplierError(''); }} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <label style={labelStyle}>
          Bill date
          <input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} style={inputStyle} required />
        </label>

        <label style={labelStyle}>
          Due date
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Category
          <select
            value={form.expenseCategory}
            onChange={(e) => {
              const nextIsStock = e.target.value === 'Inventory';
              setForm({ ...form, expenseCategory: e.target.value, lines: nextIsStock !== isStockReceipt ? [emptyLine()] : form.lines });
            }}
            style={inputStyle}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
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
          Line items{isStockReceipt && ' — picking an item receives stock at that unit cost'}
          {isForeign && ` — amounts in ${form.currency}`}
        </div>
        {form.lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px 24px', gap: 6, alignItems: 'center' }}>
            {isStockReceipt ? (
              <select value={line.itemId} onChange={(e) => pickItemForLine(i, e.target.value)} style={inputStyle} required>
                <option value="">Select item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</option>)}
              </select>
            ) : (
              <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={inputStyle} required />
            )}
            <input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={inputStyle} />
            <input type="number" min="0" step="0.01" placeholder="Cost/unit" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={inputStyle} required />
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

        <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Record bill'}</button>
      </form>

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Bills</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Bill</th>
              <th style={thStyle}>Supplier</th>
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
            {bills.map((b) => {
              const outstanding = Number(b.total) - Number(b.paid);
              return (
              <Fragment key={b.id}>
                <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>{b.bill_number}</td>
                  <td style={tdStyle}>{b.supplier_name}</td>
                  <td style={tdStyle}>{b.bill_date}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {currency(b.total)}
                    {b.currency && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{b.currency} {Number(b.foreign_total).toLocaleString(undefined, { minimumFractionDigits: 2 })} @ {b.exchange_rate}</div>}
                    {b.cost_centre_code && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{b.cost_centre_code}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(outstanding)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: b.status === 'paid' ? '#e1f5ee' : '#faeeda', color: b.status === 'paid' ? '#085041' : '#854f0b' }}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {outstanding > 0 && (
                      paymentFor === b.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={outstanding}
                            placeholder="Amount"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            style={{ ...inputStyle, width: 80, marginTop: 0 }}
                          />
                          <button type="button" onClick={() => handlePayment(b.id)} style={{ ...buttonStyle, marginTop: 0, padding: '6px 10px' }}>Save</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setPaymentFor(b.id); setPaymentAmount(String(outstanding)); }} style={ghostButtonStyle}>
                          Pay supplier
                        </button>
                      )
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => toggleExpand(b.id)} style={ghostButtonStyle} title="Details & attachments">
                      {expandedId === b.id ? '▲' : '▾'} Details
                    </button>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => handleDownloadBill(b, 'csv')} disabled={downloadingId === b.id} style={ghostButtonStyle} title="Download as CSV (opens in Excel)">
                        {downloadingId === b.id ? '…' : 'CSV'}
                      </button>
                      <button type="button" onClick={() => handleDownloadBill(b, 'pdf')} disabled={downloadingId === b.id} style={ghostButtonStyle} title="Download as PDF">
                        {downloadingId === b.id ? '…' : 'PDF'}
                      </button>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {b.status === 'void' ? (
                      <span style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>—</span>
                    ) : voidConfirmId === b.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" onClick={() => handleVoidBill(b.id)} disabled={voidingId === b.id} style={{ ...ghostButtonStyle, color: 'var(--cb-danger)' }}>
                            {voidingId === b.id ? 'Voiding…' : 'Confirm void'}
                          </button>
                          <button type="button" onClick={() => setVoidConfirmId(null)} style={ghostButtonStyle}>Cancel</button>
                        </div>
                        {voidError[b.id] && <div style={{ color: 'var(--cb-danger)', fontSize: 10.5, maxWidth: 220 }}>{voidError[b.id]}</div>}
                      </div>
                    ) : (
                      <button type="button" onClick={() => setVoidConfirmId(b.id)} style={{ ...ghostButtonStyle, color: 'var(--cb-danger)' }} title="Void this bill">
                        Void
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === b.id && (
                  <tr>
                    <td colSpan={10} style={{ padding: '0 0 14px' }}>
                      {loadingDetailId === b.id ? (
                        <div style={{ fontSize: 12.5, color: 'var(--cb-text-secondary)', padding: '8px 0' }}>Loading line items…</div>
                      ) : billDetail[b.id] ? (
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
                            {billDetail[b.id].lines.map((l) => (
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
                      {billDetail[b.id]?.payments?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cb-text-secondary)', marginBottom: 4 }}>Payments made</div>
                          {billDetail[b.id].payments.map((p) => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '4px 10px' }}>
                              <span style={{ flex: 1 }}>{p.payment_date} — {currency(p.amount)}{p.payment_method ? ` (${p.payment_method})` : ''}</span>
                              <button type="button" onClick={() => handleDownloadPayment(b, p, 'csv')} style={ghostButtonStyle} title="Download payment as CSV">CSV</button>
                              <button type="button" onClick={() => handleDownloadPayment(b, p, 'pdf')} style={ghostButtonStyle} title="Download payment as PDF">PDF</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Attachments entityType="bill" entityId={b.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {paymentError && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 8 }}>{paymentError}</div>}
        {bills.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No bills yet.</div>}
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
