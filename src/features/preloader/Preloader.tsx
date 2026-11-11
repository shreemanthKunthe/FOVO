import { useEffect, useState } from 'react';
import './preloader.css';

const SESSION_KEY = 'fovo_preloader_seen';

export function hasSeenPreloader(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPreloaderSeen(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Ignore storage quota or privacy-mode errors
  }
}

interface Props {
  onComplete: () => void;
}

/**
 * Branded FOVO cinematic preloader.
 * Runs BEFORE the landing page or application content mounts in the DOM,
 * ensuring zero content flash behind the animation.
 */
export function Preloader({ onComplete }: Props) {
  const [phase, setPhase] = useState<'enter' | 'project' | 'exit'>('enter');
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setProgress(100);
      const t = window.setTimeout(() => {
        markPreloaderSeen();
        onComplete();
      }, 280);
      return () => window.clearTimeout(t);
    }

    const start = performance.now();
    const duration = 1750; // Polished, concise 1.75s theatrical intro
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // Smooth ease-in-out cubic progress curve
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setProgress(Math.round(eased * 100));

      if (t >= 0.25 && t < 0.88) {
        setPhase((p) => (p === 'enter' ? 'project' : p));
      }

      if (t < 1) {
        raf = window.requestAnimationFrame(tick);
      } else {
        setPhase('exit');
      }
    };

    raf = window.requestAnimationFrame(tick);

    // Safety fallback so the screen can never stay stuck
    const finishTimer = window.setTimeout(() => {
      markPreloaderSeen();
      onComplete();
    }, duration + 420);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fovo-preloader fovo-preloader--${phase}`}
      role="status"
      aria-live="polite"
      aria-label="Loading FOVO cinema experience"
    >
      {/* Subtle overhead projection cone */}
      <div className="fovo-preloader-beam" aria-hidden="true" />

      {/* Framing crop marks */}
      <div className="fovo-preloader-frame" aria-hidden="true">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
      </div>

      <div className="fovo-preloader-center">
        <div className="fovo-preloader-aperture" aria-hidden="true">
          <span>2.39 : 1</span>
          <span className="dot" />
          <span>FIELD OF VIEW</span>
        </div>

        <div className="fovo-preloader-wordmark" aria-hidden="true">
          <span>F</span>
          <span>O</span>
          <span>V</span>
          <span>O</span>
        </div>

        <div className="fovo-preloader-barTrack" aria-hidden="true">
          <div
            className="fovo-preloader-barFill"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>

        <div className="fovo-preloader-meta">
          <span>CALIBRATING AUDITORIUM OPTICS</span>
          <span className="fovo-preloader-pct">{String(progress).padStart(3, '0')}%</span>
        </div>
      </div>
    </div>
  );
}

