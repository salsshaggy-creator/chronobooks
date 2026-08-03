import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const STARTER_PROMPTS = [
  'How does the auto-journal engine work?',
  'What does each Settings tab do?',
  'How do I create a new company as Super Admin?',
  'What’s the difference between the roles?',
];

// A small avatar bubble that floats over every page once someone is logged in — the
// "AI avatar" that knows everything about ChronoBooks itself (never a company's real
// data; see backend/src/ai/knowledgeBase.js for exactly what it's grounded in).
export default function AiAvatar({ isAdmin }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null); // { message, code }
  const listRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, open]);

  async function sendMessage(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setErrorInfo(null);
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const { reply } = await api.askAssistant(nextMessages);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setErrorInfo({ message: err.message, code: err.code });
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage();
  }

  return (
    <>
      {/* Bubble */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask the ChronoBooks Assistant"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 200,
          width: 58,
          height: 58,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-400))',
          boxShadow: '0 10px 28px -8px rgba(38,33,92,0.55)',
          display: open ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="cb-hover-lift"
      >
        <MiniBookAvatar />
      </button>

      {open && (
        <div
          className="cb-fade-up cb-glass"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 200,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            height: 540,
            maxHeight: 'calc(100vh - 48px)',
            borderRadius: 18,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.86))',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              background: 'linear-gradient(120deg, var(--cb-primary-900), var(--cb-primary-600) 70%, var(--cb-primary-400))',
              color: '#fff',
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MiniBookAvatar small />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>ChronoBooks Assistant</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Ask me anything about how ChronoBooks works</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 16, cursor: 'pointer', opacity: 0.85 }}>✕</button>
          </div>

          {/* Message list */}
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px' }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>
                <div style={{ marginBottom: 10 }}>
                  Hi 👋 I know every screen, field, and workflow in ChronoBooks — ask me anything, in as much detail as you like.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p} type="button" onClick={() => sendMessage(p)}
                      style={{
                        textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--cb-border)',
                        background: 'rgba(255,255,255,0.7)', fontSize: 12.5, color: 'var(--cb-text-primary)', cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                <div
                  style={{
                    maxWidth: '84%',
                    padding: '9px 12px',
                    borderRadius: 12,
                    fontSize: 13,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? 'var(--cb-primary-400)' : 'rgba(255,255,255,0.85)',
                    color: m.role === 'user' ? '#fff' : 'var(--cb-text-primary)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--cb-border)',
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                <div style={{ padding: '9px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.85)', border: '1px solid var(--cb-border)', display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cb-primary-400)', animation: 'cb-pulse-dot 1s infinite', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            {errorInfo && (
              <div style={{ fontSize: 12, color: 'var(--cb-danger)', background: '#faece7', border: '1px solid rgba(201,65,65,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 10 }}>
                {errorInfo.message}
                {isAdmin && ['ai_key_unreadable', 'ai_provider_error'].includes(errorInfo.code) && (
                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => { setOpen(false); navigate('/settings'); }}
                      style={{ border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}
                    >
                      Go to Settings → AI Assistant
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--cb-border)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about any ChronoBooks feature…"
              style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--cb-border)', fontSize: 13 }}
              disabled={sending}
            />
            <button
              type="submit" disabled={sending || !input.trim()}
              style={{ padding: '9px 14px', border: 'none', borderRadius: 10, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: sending || !input.trim() ? 0.6 : 1 }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// A single small flipping book, echoing the BookStack used on the Login page — the
// avatar is a miniature of that same motif so the brand language stays consistent.
function MiniBookAvatar({ small }) {
  const size = small ? 20 : 30;
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.78, perspective: 300 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '2px 4px 4px 2px', background: 'var(--cb-amber-400)' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: size * 0.14, borderRadius: '2px 0 0 2px', background: 'var(--cb-amber-600)' }} />
      <div
        style={{
          position: 'absolute', top: size * 0.08, left: size * 0.16, width: size * 0.72, height: size * 0.62,
          background: 'linear-gradient(120deg, #fdfdfd, #eceafc)', borderRadius: '1px 3px 3px 1px',
          transformOrigin: 'left center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden',
          animation: 'cb-page-flip 3.2s ease-in-out infinite',
        }}
      />
    </div>
  );
}
