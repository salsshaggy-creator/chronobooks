import { useEffect, useState } from 'react';
import { api } from '../api/client';
import SignaturePad from '../components/SignaturePad';

const MODULE_LABEL = {
  sales_invoice: 'Invoice', purchase_bill: 'Bill', receipt: 'Receipt',
  per_diem_expense: 'Per Diem', payroll_import: 'Payroll import', document: 'Document',
};

const currency = (n, c) => (n == null ? '—' : `${c || 'GHS'} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);

export default function Approvals() {
  const [scope, setScope] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState('');
  const [actingOn, setActingOn] = useState(null); // { id, mode: 'approve' | 'reject' }
  const [comments, setComments] = useState('');
  const [signature, setSignature] = useState(null);
  const [mySignature, setMySignature] = useState(null);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docForm, setDocForm] = useState({ title: '', notes: '' });

  function load() {
    api.listApprovals(scope).then((r) => { setRequests(r.requests); setCanApprove(r.canApprove); }).catch((err) => setError(err.message));
  }

  useEffect(load, [scope]);
  useEffect(() => { api.getMySignature().then((r) => setMySignature(r.signatureData)).catch(() => {}); }, []);

  function startAction(id, mode) {
    setActingOn({ id, mode });
    setComments('');
    setSignature(mySignature || null);
    setError('');
  }

  async function confirmApprove(id) {
    setError('');
    try {
      await api.approveRequest(id, { signatureData: signature, comments });
      setActingOn(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmReject(id) {
    setError('');
    if (!comments) return setError('A reason is required when rejecting a request.');
    try {
      await api.rejectRequest(id, comments);
      setActingOn(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitDocRequest(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createDocumentApproval(docForm);
      setDocForm({ title: '', notes: '' });
      setShowDocForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Approvals</h1>
        <button type="button" onClick={() => setShowDocForm((v) => !v)} style={ghostButtonStyle}>+ Request a document signature</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4, marginBottom: 16 }}>
        Invoices, bills, receipts, per diem claims, and payroll imports wait here for sign-off when their toggle is on in Settings → Approvals — nothing posts to the books until it's approved.
      </p>

      {showDocForm && (
        <form onSubmit={submitDocRequest} style={{ ...cardStyle, display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, maxWidth: 700 }}>
          <label style={{ ...labelStyle, flex: 1 }}>Title<input value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} style={inputStyle} required /></label>
          <label style={{ ...labelStyle, flex: 2 }}>Notes<input value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} style={inputStyle} /></label>
          <button type="submit" style={buttonStyle}>Send for signature</button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['pending', 'mine', 'history'].map((s) => (
          <button
            key={s} onClick={() => setScope(s)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--cb-border)', textTransform: 'capitalize',
              background: scope === s ? 'var(--cb-primary-400)' : 'var(--cb-surface)',
              color: scope === s ? 'var(--cb-primary-900)' : 'var(--cb-text-primary)', fontWeight: 600, fontSize: 13,
            }}
          >
            {s === 'mine' ? 'My requests' : s}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={cardStyle}>
        {requests.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>Nothing here.</div>}
        {requests.map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid var(--cb-border)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cb-primary-800)', background: 'var(--cb-primary-50)', borderRadius: 999, padding: '2px 8px', marginRight: 8 }}>
                  {MODULE_LABEL[r.module] || r.module}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.description}</span>
                <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginTop: 3 }}>
                  Requested by {r.requested_by_name} · {String(r.created_at).slice(0, 16)}
                  {r.status !== 'pending' && ` · ${r.status} by ${r.approver_name || '—'}${r.decided_at ? ' on ' + String(r.decided_at).slice(0, 10) : ''}`}
                </div>
                {r.comments && <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginTop: 3, fontStyle: 'italic' }}>“{r.comments}”</div>}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 14 }}>
                {r.amount != null && <span style={{ fontSize: 14, fontWeight: 700 }}>{currency(r.amount, r.currency)}</span>}
                <StatusPill status={r.status} />
              </div>
            </div>

            {r.status === 'pending' && canApprove && actingOn?.id !== r.id && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => startAction(r.id, 'approve')} style={{ ...buttonStyle, padding: '6px 12px' }}>Approve</button>
                <button type="button" onClick={() => startAction(r.id, 'reject')} style={{ ...ghostButtonStyle, color: 'var(--cb-danger)', borderColor: 'var(--cb-danger)' }}>Reject</button>
              </div>
            )}

            {actingOn?.id === r.id && actingOn.mode === 'approve' && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--cb-bg)', borderRadius: 10, maxWidth: 460 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sign to approve</div>
                <SignaturePad initialDataUrl={mySignature} onChange={setSignature} height={110} />
                <label style={{ ...labelStyle, display: 'block', marginTop: 8 }}>
                  Comments (optional)
                  <input value={comments} onChange={(e) => setComments(e.target.value)} style={inputStyle} />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => confirmApprove(r.id)} style={{ ...buttonStyle, padding: '6px 12px' }}>Confirm approval</button>
                  <button type="button" onClick={() => setActingOn(null)} style={{ ...ghostButtonStyle }}>Cancel</button>
                </div>
              </div>
            )}

            {actingOn?.id === r.id && actingOn.mode === 'reject' && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--cb-bg)', borderRadius: 10, maxWidth: 460 }}>
                <label style={labelStyle}>
                  Reason for rejection
                  <input value={comments} onChange={(e) => setComments(e.target.value)} style={inputStyle} required />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => confirmReject(r.id)} style={{ ...buttonStyle, padding: '6px 12px', background: 'var(--cb-danger)', color: '#fff' }}>Confirm rejection</button>
                  <button type="button" onClick={() => setActingOn(null)} style={ghostButtonStyle}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: { bg: '#faeeda', fg: '#854f0b', label: 'Pending' },
    approved: { bg: '#e1f5ee', fg: '#085041', label: 'Approved' },
    rejected: { bg: '#faece7', fg: '#993c1d', label: 'Rejected' },
  };
  const s = map[status] || map.pending;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.fg }}>{s.label}</span>;
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { padding: '9px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghostButtonStyle = { padding: '9px 14px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 };
