'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ElectricLogo from './ElectricLogo.jsx';
import './IntroSplash.css';

const WORD = 'CHAKRAVYUH'.split('');
const SESSION_FLAG = 'vyuh.intro.seen';

const IntroSplash = ({ duration = 4000, onDone }) => {
  const [show, setShow] = useState(() => {
    try {
      return window.sessionStorage.getItem(SESSION_FLAG) !== '1';
    } catch {
      return true;
    }
  });
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setLeaving(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setShow(false);
      onDone?.();
    }, 650);
  }, [onDone]);

  useEffect(() => {
    if (!show) return;
    try {
      window.sessionStorage.setItem(SESSION_FLAG, '1');
    } catch {
      /* private mode — splash simply plays each load */
    }

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = reduced ? Math.min(1800, duration) : duration;
    timerRef.current = window.setTimeout(dismiss, wait);

    const onKey = e => {
      if (e.key === 'Escape' || e.key === 'Enter') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [show, duration, dismiss]);

  if (!show) return null;

  return (
    <div
      className={`intro-splash${leaving ? ' intro-splash--leaving' : ''}`}
      onClick={dismiss}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') dismiss();
      }}
    >
      <div className="intro-inner">
        <div className="intro-logo">
          <ElectricLogo
            src="/chakravyuh-icon.svg"
            color="#ffd6ef"
            glowColor="#b84dff"
            scale={0.75}
            interactive
          />
        </div>

        <div className="intro-copy">
          <div className="intro-word" aria-label="CHAKRAVYUH">
            {WORD.map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                className="intro-letter"
                style={{ animationDelay: `${0.25 + i * 0.07}s` }}
              >
                {ch}
              </span>
            ))}
          </div>
          <div className="intro-sub">
            <span className="intro-sub-line">INVESTIGATOR&nbsp;INTELLIGENCE&nbsp;PLATFORM</span>
            <span className="intro-sub-tag">connecting scattered records · never determining guilt</span>
          </div>
        </div>
      </div>

      <div className="intro-bar-wrap" aria-hidden="true">
        <div className="intro-bar" style={{ animationDuration: `${duration}ms` }} />
      </div>

      <div className="intro-hint">
        CLICK / ESC / ENTER TO SKIP
      </div>
    </div>
  );
};

export default IntroSplash;
