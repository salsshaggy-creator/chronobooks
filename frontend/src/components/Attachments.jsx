import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

function formatSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Drop-in attachments panel for any entity (invoice, bill, expense, quote, fixed asset) --
// pass its type and id and it handles listing, uploading, downloading, and deleting the
// receipts/files pinned to it. Meant to sit inside an expandable row under a list item,
// the same "expand for detail" pattern Recurring.jsx uses for run history.
export default function Attachments({ entityType, entityId, currentUserId }) {
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  function load() {
    api.listDocuments(entityType, entityId).then((r) => setDocuments(r.documents)).catch((err) => setError(err.message));
  }

  useEffect(load, [entityType, entityId]);

  async function handleFilePicked(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      await api.uploadDocument(entityType, entityId, file);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    setError('');
    try {
      await api.deleteDocument(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: '10px 14px', background: 'var(--cb-primary-50)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)' }}>Attachments</div>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={attachButtonStyle}>
          {uploading ? 'Uploading…' : '+ Attach file'}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFilePicked} style={{ display: 'none' }} />
      </div>

      {documents.length === 0 && <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>No files attached yet.</div>}

      {documents.map((doc) => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--cb-border)', fontSize: 12.5 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => api.downloadDocument(doc.id, doc.file_name).catch((err) => setError(err.message))} style={fileLinkStyle}>
              📎 {doc.file_name}
            </button>
            <span style={{ fontSize: 10.5, color: 'var(--cb-text-secondary)' }}>
              {formatSize(doc.size_bytes)} · {doc.uploaded_by_name || 'someone'} · {String(doc.created_at).slice(0, 10)}
            </span>
          </div>
          {/* The server is the real gatekeeper (uploader or an admin/accountant/finance-manager
              role can delete) -- the button is shown to everyone and a rejected attempt just
              surfaces the server's error message below. */}
          <button type="button" onClick={() => handleDelete(doc.id)} style={removeButtonStyle} title="Remove attachment">✕</button>
        </div>
      ))}

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const attachButtonStyle = { padding: '4px 9px', border: '1px solid var(--cb-border)', borderRadius: 6, background: '#fff', color: 'var(--cb-primary-800)', fontSize: 11.5, fontWeight: 600 };
const fileLinkStyle = { background: 'none', border: 'none', padding: 0, color: 'var(--cb-primary-800)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' };
const removeButtonStyle = { background: 'none', border: 'none', color: 'var(--cb-text-secondary)', fontSize: 12, cursor: 'pointer', padding: '2px 6px' };
