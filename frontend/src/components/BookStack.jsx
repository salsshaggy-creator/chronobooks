// Three books, each with a page endlessly flipping — replaces ChronoSync's login
// clock with something accounting-flavored. Colors are pulled from the same
// --cb-primary-*/--cb-amber-* CSS variables the brand preset system controls, so
// once a company's preset is known these recolor with it; the whole illustration
// also carries a slow hue-drift so it stays alive even on the pre-login screen
// where no company/brand is known yet.
const BOOKS = [
  { cover: 'var(--cb-primary-400)', spine: 'var(--cb-primary-600)', duration: '4.5s', delay: '0s' },
  { cover: 'var(--cb-amber-400)', spine: 'var(--cb-amber-600)', duration: '5.2s', delay: '0.6s' },
  { cover: 'var(--cb-primary-200)', spine: 'var(--cb-primary-400)', duration: '4.8s', delay: '1.2s' },
];

function Book({ cover, spine, duration, delay, floatDelay }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 74,
        height: 100,
        animation: `cb-float 3.6s ease-in-out infinite`,
        animationDelay: floatDelay,
      }}
    >
      {/* cover */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '4px 8px 8px 4px',
          background: cover,
          boxShadow: '0 14px 26px -10px rgba(0,0,0,0.45)',
        }}
      />
      {/* spine */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 9,
          borderRadius: '4px 0 0 4px',
          background: spine,
        }}
      />
      {/* flipping page */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 9,
          width: 58,
          height: 88,
          background: 'linear-gradient(120deg, #fdfdfd, #eceafc)',
          borderRadius: '1px 5px 5px 1px',
          transformOrigin: 'left center',
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          boxShadow: '1px 0 4px rgba(0,0,0,0.12)',
          animation: `cb-page-flip ${duration} ease-in-out infinite`,
          animationDelay: delay,
        }}
      >
        <div style={{ padding: '8px 7px' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 2.5, marginBottom: 7, borderRadius: 2, background: 'rgba(38,33,92,0.12)', width: i === 3 ? '55%' : '100%' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BookStack() {
  return (
    <div
      style={{
        position: 'relative',
        width: 260,
        height: 220,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'cb-hue-drift 9s ease-in-out infinite',
      }}
    >
      {/* ambient glow, echoes the ChronoSync clock's glow */}
      <div
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(127,119,221,0.45), rgba(127,119,221,0) 70%)',
          filter: 'blur(2px)',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 14, perspective: 700 }}>
        {BOOKS.map((b, i) => (
          <Book key={i} {...b} floatDelay={`${i * 0.4}s`} />
        ))}
      </div>
      {/* shelf */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 210,
          height: 6,
          borderRadius: 999,
          background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0))',
        }}
      />
    </div>
  );
}
