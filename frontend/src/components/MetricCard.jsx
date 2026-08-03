export default function MetricCard({ label, value, tone = 'default', icon, chipBg, delay = 0 }) {
  const toneColor = {
    default: 'var(--cb-text-primary)',
    danger: 'var(--cb-danger)',
    success: 'var(--cb-success)',
  }[tone];

  return (
    <div
      className="cb-fade-up cb-hover-lift cb-glass"
      style={{
        animationDelay: `${delay}ms`,
        borderRadius: 16,
        padding: '16px 18px',
        overflow: 'hidden',
      }}
    >
      <div className="cb-glass-veins" />
      {icon && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: 32,
            height: 32,
            borderRadius: 9,
            background: chipBg || 'var(--cb-primary-50)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            marginBottom: 10,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1, fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative', zIndex: 1, fontSize: 22, fontWeight: 700, color: toneColor }}>{value}</div>
    </div>
  );
}
