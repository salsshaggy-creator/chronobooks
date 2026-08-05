import FAQList from '../components/FAQList';

// In-app Help / FAQ page, reached from the sidebar once signed in. Renders the same
// content as the public /faq page (via components/FAQList + data/faqData.js) so the
// two never drift apart.
export default function Help() {
  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--cb-text-primary)', marginBottom: 4 }}>
        Help &amp; FAQ
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--cb-text-secondary)', marginBottom: 26, lineHeight: 1.6 }}>
        Answers about your trial, plans and modules, and how your data is kept secure.
        For anything else, ask the AI assistant in the bottom corner.
      </div>
      <FAQList />
    </div>
  );
}
