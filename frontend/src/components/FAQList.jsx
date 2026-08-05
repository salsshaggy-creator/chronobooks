import { useState } from 'react';
import { FAQ_CATEGORIES } from '../data/faqData';

// Shared categorized accordion, used by both the public /faq page and the in-app
// Help page (pages/FAQ.jsx and pages/Help.jsx) so the content only has to live in one
// place (data/faqData.js).
export default function FAQList() {
  const [openKey, setOpenKey] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {FAQ_CATEGORIES.map((group) => (
        <div key={group.category}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--cb-primary-600)', marginBottom: 10 }}>
            {group.category}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.items.map((item) => {
              const key = `${group.category}::${item.q}`;
              const open = openKey === key;
              return (
                <div
                  key={key}
                  style={{
                    border: '1px solid var(--cb-border)',
                    borderRadius: 10,
                    background: 'var(--cb-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? null : key)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '13px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--cb-text-primary)',
                    }}
                  >
                    <span>{item.q}</span>
                    <span style={{ color: 'var(--cb-primary-600)', fontSize: 13, flexShrink: 0 }}>{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <div style={{ padding: '0 16px 15px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--cb-text-secondary)' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
