'use client';

import { useEffect, useRef } from 'react';
import './ElectricLogo.css';

/**
 * ElectricLogo — a glowing, pointer-reactive logo shell.
 * The logo image is drawn from `src`; the glow and tilt respond to the cursor.
 */
export default function ElectricLogo({
  src,
  color = '#ffd6ef',
  glowColor = '#b84dff',
  scale = 1,
  interactive = true
}) {
  const wrapRef = useRef(null);
  const rafRef = useRef(0);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !interactive) return;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      target.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      target.current.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => {
      target.current.x = 0;
      target.current.y = 0;
    };

    const tick = () => {
      const c = current.current;
      c.x += (target.current.x - c.x) * 0.08;
      c.y += (target.current.y - c.y) * 0.08;
      el.style.setProperty('--ex', c.x.toFixed(4));
      el.style.setProperty('--ey', c.y.toFixed(4));
      el.style.setProperty('--energy', (0.5 + Math.hypot(c.x, c.y) * 0.5).toFixed(4));
      rafRef.current = requestAnimationFrame(tick);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, [interactive]);

  return (
    <div
      ref={wrapRef}
      className="electric-logo"
      style={{
        '--logo-color': color,
        '--logo-glow': glowColor,
        transform: `scale(${scale})`
      }}
    >
      <img src={src} alt="" className="electric-logo__img" />
      <span className="electric-logo__glow" aria-hidden="true" />
    </div>
  );
}