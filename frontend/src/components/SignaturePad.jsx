import { useEffect, useRef, useState } from 'react';

// A small canvas draw pad for capturing an electronic signature (mouse or touch),
// exported as a base64 PNG data URL — used both for saving a reusable "My Signature"
// and for signing a specific approval decision on the spot.
export default function SignaturePad({ onChange, initialDataUrl, height = 140 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!initialDataUrl);

  function getCtx() {
    return canvasRef.current.getContext('2d');
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1c1a33';
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initialDataUrl;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pointFromEvent(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: ((point.clientX - rect.left) / rect.width) * canvas.width, y: ((point.clientY - rect.top) / rect.height) * canvas.height };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pointFromEvent(e);
    const ctx = getCtx();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pointFromEvent(e);
    const ctx = getCtx();
    ctx.lineTo(x, y);
    ctx.stroke();
    setIsEmpty(false);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    getCtx().clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={420}
        height={height * 2}
        style={{ width: '100%', height, border: '1px dashed var(--cb-border)', borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{isEmpty ? 'Draw your signature above' : 'Signature captured'}</span>
        <button type="button" onClick={clear} style={{ border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
      </div>
    </div>
  );
}
