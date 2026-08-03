export default function ComingSoon({ title }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</h1>
      <div
        style={{
          background: 'var(--cb-surface)',
          border: '1px dashed var(--cb-border)',
          borderRadius: 'var(--cb-radius)',
          padding: 24,
          color: 'var(--cb-text-secondary)',
          fontSize: 13,
        }}
      >
        {title} is on the V1 roadmap and wires up next, on top of the same auto-journal engine used by Expenses.
      </div>
    </div>
  );
}
