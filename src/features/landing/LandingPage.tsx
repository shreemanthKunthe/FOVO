import { useEffect, useMemo, useRef, useState } from 'react';
import { useBooking } from '../../store/bookingStore';
import { referenceAuditorium } from '../../domain/layout/presets';
import { getSeats } from '../../domain/layout/generateSeats';
import { mockAvailability } from '../../data/mockAvailability';
import { describeAngle, viewingStats } from '../../domain/viewing';
import { getRegisteredMovies, type Movie } from '../../data/movies';
import { fetchDiscoveryMovies } from '../../services/tmdbClient';
import { nextDates, SHOW_TIMES } from '../../data/cinemas';
import { SeatMap } from '../seatmap/SeatMap';
import './landing.css';

interface PresetSeat {
  id: string;
  tag: string;
  category: string;
  caption: string;
}

const PRESET_SEATS: PresetSeat[] = [
  {
    id: 'G-8',
    tag: 'SWEET SPOT · CENTRE',
    category: 'Classic Plus · Row G',
    caption: 'Eye-level alignment with zero horizontal skew and balanced 42° screen coverage.',
  },
  {
    id: 'L-6',
    tag: 'FRONT ROW · LOUNGER',
    category: 'Lounger · Row L',
    caption: 'Reclined close-range immersion where the screen spans nearly your entire peripheral vision.',
  },
  {
    id: 'A-9',
    tag: 'ELEVATED · BACK ROW',
    category: 'Prime · Row A',
    caption: 'High stadium riser elevation overlooking the entire auditorium and acoustic field.',
  },
  {
    id: 'E-1',
    tag: 'OFF-AXIS · LEFT AISLE',
    category: 'Classic Plus · Row E',
    caption: 'True oblique perspective showing exact horizontal angle before you commit to an edge seat.',
  },
];

/**
 * Illustrated first-person viewport used in editorial hero and comparison frames.
 */
function IllustratedFirstPerson({
  seatId,
  badge,
  interactiveHint,
  onSelectPreset,
}: {
  seatId: string;
  badge?: string;
  interactiveHint?: string;
  onSelectPreset?: (id: string) => void;
}) {
  const seats = useMemo(() => getSeats(referenceAuditorium), []);
  const seat = seats.find((s) => s.id === seatId) ?? seats[90];
  const stats = viewingStats(seat, referenceAuditorium);
  const [ex, ey, ez] = seat.eye.position;

  // Perspective shift based on real seat world coordinates
  const normX = ex / (referenceAuditorium.dims.width / 2); // -1 .. 1
  const normZ = (ez - 5.5) / 13; // 0 (front) .. 1 (back)
  const screenScale = 1.22 - normZ * 0.42;
  const shiftX = -normX * 68;
  const skewY = normX * 9;
  const pitchY = (ey - 2.8) * 10;

  return (
    <div className="fovo-fpv-frame">
      <div className="fovo-fpv-chrome">
        <div className="fovo-fpv-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="fovo-fpv-url">
          FOVO://AUDITORIUM-01/SEAT-{seat.id} · {stats.distance.toFixed(1)}M · {describeAngle(stats).toUpperCase()}
        </div>
        <div className="fovo-fpv-pill">{badge ?? 'EYE-LEVEL 1:1'}</div>
      </div>

      <svg
        className="fovo-fpv-svg"
        viewBox="0 0 960 520"
        role="img"
        aria-label={`First-person cinema perspective from seat ${seat.id}`}
      >
        <defs>
          <linearGradient id={`beam-${seat.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E5B84B" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#0B0B0D" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`scr-${seat.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a2436" />
            <stop offset="52%" stopColor="#0f1722" />
            <stop offset="100%" stopColor="#261914" />
          </linearGradient>
        </defs>

        {/* Auditorium dark shell */}
        <rect width="960" height="520" fill="#0B0B0D" />

        {/* Architectural perspective lines */}
        <g className="fovo-fpv-arch" stroke="#232329" strokeWidth="1">
          <line x1="0" y1="0" x2={210 + shiftX} y2={95 + pitchY} />
          <line x1="960" y1="0" x2={750 + shiftX} y2={95 + pitchY} />
          <line x1="0" y1="520" x2={170 + shiftX} y2={355 + pitchY} />
          <line x1="960" y1="520" x2={790 + shiftX} y2={355 + pitchY} />
          {/* Acoustic wall slats */}
          {[-340, -270, -200, 200, 270, 340].map((offset, idx) => (
            <line
              key={idx}
              x1={480 + offset * 1.35}
              y1="30"
              x2={480 + shiftX + offset * 0.85}
              y2="380"
              stroke="#19191F"
            />
          ))}
        </g>

        {/* Ambient projection cone */}
        <polygon
          className="fovo-fpv-beam"
          points={`480,0 ${180 + shiftX},${105 + pitchY} ${780 + shiftX},${105 + pitchY}`}
          fill={`url(#beam-${seat.id})`}
        />

        {/* Cinema screen transformed by seat position */}
        <g
          className="fovo-fpv-screenGroup"
          style={{
            transform: `translate(${480 + shiftX}px, ${215 + pitchY}px) scale(${screenScale}) skewY(${skewY}deg)`,
          }}
        >
          {/* Screen outer mask */}
          <rect x="-290" y="-118" width="580" height="236" rx="4" fill="#050507" stroke="#303034" strokeWidth="2" />
          {/* Active 2.39:1 canvas */}
          <rect x="-276" y="-106" width="552" height="212" fill={`url(#scr-${seat.id})`} />

          {/* Cinematic frame artwork inside screen */}
          <circle className="fovo-fpv-sun" cx="-70" cy="-10" r="74" fill="#FF813D" fillOpacity="0.85" />
          <circle className="fovo-fpv-eclipse" cx="-42" cy="-18" r="58" fill="#0f1722" />
          <polygon points="-276,106 -90,18 65,106" fill="#0B0B0D" />
          <polygon points="-40,106 115,-8 276,106" fill="#161d29" />
          <line
            className="fovo-fpv-scanline"
            x1="-276"
            y1="48"
            x2="276"
            y2="48"
            stroke="#E5B84B"
            strokeOpacity="0.65"
            strokeWidth="1.5"
          />

          {/* On-screen telemetry */}
          <text x="-252" y="-76" fill="#E5B84B" fontSize="11" fontFamily="Manrope, sans-serif" letterSpacing="2">
            2.39:1 SCOPE · STARFALL TRAILER REEL
          </text>
          <text x="-252" y="84" fill="#F5F5F2" fontSize="26" fontWeight="700" fontFamily="Manrope, sans-serif">
            SEAT {seat.id} — {Math.round(stats.coverageDeg)}° FOV
          </text>
          <rect x="158" y="64" width="96" height="26" rx="13" fill="#E5B84B" />
          <text x="206" y="81" textAnchor="middle" fill="#0B0B0D" fontSize="11" fontWeight="700" fontFamily="Manrope, sans-serif">
            LIVE VIEW
          </text>
        </g>

        {/* Foreground cinema chair silhouettes */}
        {[0, 1, 2].map((rowIdx) => {
          const yBase = 392 + rowIdx * 44;
          const count = 9 + rowIdx * 2;
          const span = 560 + rowIdx * 130;
          return (
            <g key={rowIdx} opacity={0.55 + rowIdx * 0.2}>
              {Array.from({ length: count }).map((_, i) => {
                const cx = 480 - span / 2 + (span / (count - 1)) * i + shiftX * (0.35 - rowIdx * 0.1);
                const w = 44 + rowIdx * 8;
                const h = 34 + rowIdx * 6;
                const isCurrentSeat = rowIdx === 2 && i === Math.floor(count / 2);
                return (
                  <rect
                    key={i}
                    className="fovo-fpv-chair"
                    x={cx - w / 2}
                    y={yBase}
                    width={w}
                    height={h}
                    rx="7"
                    fill={isCurrentSeat ? '#E5B84B' : '#1B1B1F'}
                    stroke={isCurrentSeat ? '#E5B84B' : '#303034'}
                    strokeWidth="1.5"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Warm theatre wall & step-light markers */}
        <rect x="82" y="458" width="22" height="4" fill="#8A6D3B" />
        <rect x="856" y="458" width="22" height="4" fill="#8A6D3B" />
      </svg>

      <div className="fovo-fpv-hud">
        <div className="fovo-fpv-metrics">
          <div>
            <span>SEAT</span>
            <strong>{seat.id}</strong>
          </div>
          <div>
            <span>SECTION</span>
            <strong>{referenceAuditorium.sections[seat.section].label}</strong>
          </div>
          <div>
            <span>DISTANCE</span>
            <strong>{stats.distance.toFixed(1)} m</strong>
          </div>
          <div>
            <span>VIEW ANGLE</span>
            <strong>{describeAngle(stats)}</strong>
          </div>
          <div>
            <span>HORIZONTAL FOV</span>
            <strong>{Math.round(stats.coverageDeg)}°</strong>
          </div>
        </div>

        {onSelectPreset && (
          <div className="fovo-fpv-Switch" role="group" aria-label="Switch preview seat">
            {PRESET_SEATS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === seat.id ? 'active' : ''}
                onClick={() => onSelectPreset(p.id)}
              >
                {p.id}
              </button>
            ))}
          </div>
        )}
        {interactiveHint && <span className="fovo-fpv-hint">{interactiveHint}</span>}
      </div>
    </div>
  );
}

export function LandingPage() {
  const go = useBooking((s) => s.go);
  const launchSeatPreview = useBooking((s) => s.launchSeatPreview);

  const seats = useMemo(() => getSeats(referenceAuditorium), []);
  const defaultDate = useMemo(() => nextDates(1)[0].key, []);
  const availability = useMemo(
    () => mockAvailability(seats, `cinepolis-urban-oasis-hbl|${defaultDate}|18:15`),
    [seats, defaultDate],
  );

  // Hero interactive preset seat
  const [heroSeatId, setHeroSeatId] = useState<string>('G-8');
  // Problem comparison seat
  const [problemSeatId, setProblemSeatId] = useState<string>('C-3');
  // Spatial audio demo seat
  const [audioSeatId, setAudioSeatId] = useState<'G-8' | 'L-3' | 'B-15'>('G-8');
  // Perspective explorer seat
  const [explorerSeatId, setExplorerSeatId] = useState<string>('G-8');

  const pageRef = useRef<HTMLDivElement | null>(null);

  const explorerSeat = useMemo(
    () => seats.find((s) => s.id === explorerSeatId) ?? seats[0],
    [seats, explorerSeatId],
  );
  const explorerStats = useMemo(
    () => viewingStats(explorerSeat, referenceAuditorium),
    [explorerSeat],
  );

  // Subtle reveal-on-scroll observer + scroll/pointer parallax variables
  useEffect(() => {
    const nodes = document.querySelectorAll('.fovo-reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.12 },
    );
    nodes.forEach((n) => io.observe(n));

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const root = pageRef.current;
        if (!root) return;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        root.style.setProperty('--scroll-p', progress.toFixed(4));
        root.style.setProperty('--scroll-y', `${Math.min(400, window.scrollY * 0.12).toFixed(1)}px`);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const onHeroPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    e.currentTarget.style.setProperty('--mx', mx.toFixed(3));
    e.currentTarget.style.setProperty('--my', my.toFixed(3));
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const [liveMovies, setLiveMovies] = useState<Movie[]>(() => getRegisteredMovies());

  // Warm the live Indian discovery catalog in the background so launching a seat preview is immediate
  useEffect(() => {
    let active = true;
    fetchDiscoveryMovies({ category: 'now_showing', page: 1 }).then((res) => {
      if (active && res.movies.length > 0) {
        setLiveMovies(res.movies);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const openFullExperience = async (seatId = heroSeatId) => {
    let list = liveMovies.length > 0 ? liveMovies : getRegisteredMovies();
    if (list.length === 0) {
      const res = await fetchDiscoveryMovies({ category: 'now_showing', page: 1 });
      list = res.movies;
      if (list.length > 0) setLiveMovies(list);
    }
    if (list.length > 0) {
      launchSeatPreview(list[0].id, 'cinepolis-urban-oasis-hbl', defaultDate, SHOW_TIMES[2], seatId);
    } else {
      go('movies');
    }
  };

  return (
    <div className="fovo-page" ref={pageRef}>
      <div className="fovo-scroll-progress" aria-hidden="true" />

      {/* ================================================================
          HEADER
      ================================================================ */}
      <header className="fovo-header">
        <a
          href="#top"
          className="fovo-wordmark"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          FOVO
        </a>

        <nav className="fovo-nav" aria-label="Primary">
          <button type="button" onClick={() => scrollToSection('experience')}>
            Experience
          </button>
          <button type="button" onClick={() => scrollToSection('how-it-works')}>
            How it works
          </button>
          <button type="button" onClick={() => scrollToSection('technology')}>
            Technology
          </button>
        </nav>

        <button type="button" className="fovo-header-cta" onClick={() => go('movies')}>
          Explore FOVO <span>→</span>
        </button>
      </header>

      {/* ================================================================
          HERO
      ================================================================ */}
      <section className="fovo-hero" id="top" onPointerMove={onHeroPointerMove}>
        <div className="fovo-hero-top">
          <h1 className="fovo-hero-title">
            <span className="fovo-hero-line" style={{ '--line-i': 0 } as React.CSSProperties}>
              <span>Your seat.</span>
            </span>
            <span className="fovo-hero-line" style={{ '--line-i': 1 } as React.CSSProperties}>
              <span>Your view.</span>
            </span>
            <span className="fovo-hero-line" style={{ '--line-i': 2 } as React.CSSProperties}>
              <span>
                <span className="fovo-title-inline-pill">FOV 1:1</span> Your movie.
              </span>
            </span>
          </h1>

          <div className="fovo-hero-aside fovo-hero-fade">
            <span className="fovo-eyebrow">FIELD-OF-VIEW CINEMA PLATFORM</span>
            <p className="fovo-hero-copy">
              Experience the movie from your seat before you book it.
            </p>
            <div className="fovo-hero-actions">
              <button
                type="button"
                className="fovo-btn-lime"
                onClick={() => openFullExperience(heroSeatId)}
              >
                <span className="fovo-btn-dot" />
                Experience FOVO
              </button>
              <button
                type="button"
                className="fovo-btn-outline"
                onClick={() => scrollToSection('how-it-works')}
              >
                See how it works
              </button>
            </div>
          </div>
        </div>

        {/* Ruled editorial grid stage with floating geometric badges + dominant FPV visual */}
        <div className="fovo-hero-stage fovo-ruled-grid">
          <div className="fovo-geo-tag fovo-geo-tag--lime">
            183 SEATS · MAPPED IN 3D METRES
          </div>
          <div className="fovo-geo-tag fovo-geo-tag--orange">
            TRUE SIGHTLINE &amp; HRTF AUDIO
          </div>
          <div className="fovo-geo-polygon" aria-hidden="true" />
          <div className="fovo-geo-square" aria-hidden="true" />

          <div className="fovo-hero-showcase">
            <IllustratedFirstPerson
              seatId={heroSeatId}
              badge="INTERACTIVE HERO PREVIEW"
              onSelectPreset={setHeroSeatId}
            />
          </div>
        </div>

        {/* Spec strip */}
        <div className="fovo-spec-strip" aria-label="Platform capabilities">
          <div className="fovo-spec-track">
            <span>REALISTIC 3D AUDITORIUM</span>
            <span>EYE-LEVEL CAMERA PER SEAT</span>
            <span>LIVE TRAILER PROJECTION</span>
            <span>HEADPHONE SPATIAL AUDIO</span>
            <span>FOUR SEATING TIERS</span>
            <span aria-hidden="true">REALISTIC 3D AUDITORIUM</span>
            <span aria-hidden="true">EYE-LEVEL CAMERA PER SEAT</span>
            <span aria-hidden="true">LIVE TRAILER PROJECTION</span>
            <span aria-hidden="true">HEADPHONE SPATIAL AUDIO</span>
            <span aria-hidden="true">FOUR SEATING TIERS</span>
          </div>
        </div>
      </section>

      {/* ================================================================
          INTRODUCTION / BRAND STATEMENT
      ================================================================ */}
      <section className="fovo-statement fovo-reveal">
        <div className="fovo-statement-bar">
          <span className="fovo-eyebrow">THE WAY WE CHOOSE CINEMA SEATS IS CHANGING.</span>
          <span className="fovo-eyebrow">FOVO / FIELD OF VIEW</span>
        </div>

        <div className="fovo-statement-body">
          <h2>
            Why <span className="fovo-token-lime">imagine</span> your view when you can{' '}
            <span className="fovo-token-orange">experience</span> it?
          </h2>
          <p>
            Every ticketing app shows you the same flat grid of tiny boxes. None of them show
            whether the screen fills your vision, how steep the riser is, or how skewed a side row
            feels. FOVO replaces guesswork with a physical first-person simulation of every chair in
            the room.
          </p>
        </div>
      </section>

      {/* ================================================================
          THE PROBLEM
      ================================================================ */}
      <section className="fovo-problem fovo-reveal" id="experience">
        <div className="fovo-problem-header">
          <div>
            <h2 className="fovo-section-title">
              Choosing a seat shouldn’t be a guessing game.
            </h2>
          </div>
          <p className="fovo-problem-lead">
            A 2D icon tells you a seat is open. It never tells you how the screen actually looks
            from that coordinate. Click any seat on the flat map below to see what traditional apps
            hide—and what FOVO reveals immediately.
          </p>
        </div>

        <div className="fovo-problem-grid">
          {/* Left column: conventional flat 2D map */}
          <div className="fovo-problem-card fovo-ruled-grid">
            <div className="fovo-card-topline">
              <span className="fovo-pill-dark">WHAT TICKETING SITES SHOW</span>
              <span className="fovo-mono">2D TOP-DOWN GRID ONLY</span>
            </div>
            <div className="fovo-problem-map-wrap">
              <SeatMap
                compact
                config={referenceAuditorium}
                seats={seats}
                availability={availability}
                selectedId={problemSeatId}
                onSelect={setProblemSeatId}
              />
            </div>
            <div className="fovo-problem-caption">
              Selected coordinate: <strong>Seat {problemSeatId}</strong> — on a conventional map it
              is just a coloured square.
            </div>
          </div>

          {/* Geometric connector */}
          <div className="fovo-problem-connector" aria-hidden="true">
            <div className="fovo-connector-hex">1:1</div>
            <div className="fovo-connector-line" />
            <span className="fovo-connector-label">CAMERA POSE MAPPED</span>
          </div>

          {/* Right column: corresponding first-person preview */}
          <div className="fovo-problem-preview">
            <div className="fovo-card-topline">
              <span className="fovo-pill-lime">WHAT FOVO SHOWS INSTANTLY</span>
              <button
                type="button"
                className="fovo-inline-link"
                onClick={() => openFullExperience(problemSeatId)}
              >
                Open {problemSeatId} in full 3D →
              </button>
            </div>
            <IllustratedFirstPerson
              seatId={problemSeatId}
              badge={`SEAT ${problemSeatId} PERSPECTIVE`}
              onSelectPreset={setProblemSeatId}
            />
          </div>
        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS (3 DISTINCT COMPOSITIONS)
      ================================================================ */}
      <section className="fovo-steps fovo-reveal" id="how-it-works">
        <div className="fovo-steps-head">
          <h2 className="fovo-section-title">Three steps to a better movie night.</h2>
        </div>

        {/* STEP 01 — Editorial row with interactive movie slate */}
        <article className="fovo-step-row fovo-step-row--01">
          <div className="fovo-step-num">01</div>
          <div className="fovo-step-text">
            <span className="fovo-step-pill fovo-step-pill--lime">DISCOVER &amp; SELECT</span>
            <h3>Choose your movie.</h3>
            <p>
              Explore available movies, cinemas and showtimes. Every auditorium layout and screen
              format is pre-configured with its exact seating geometry.
            </p>
            <button type="button" className="fovo-btn-outline" onClick={() => go('movies')}>
              Browse Now Showing →
            </button>
          </div>
          <div className="fovo-step-visual fovo-ruled-grid">
            <div className="fovo-mini-slateGrid">
              {liveMovies.length > 0 ? (
                liveMovies.slice(0, 4).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="fovo-mini-slate"
                    onClick={() =>
                      launchSeatPreview(m.id, 'cinepolis-urban-oasis-hbl', defaultDate, SHOW_TIMES[2], 'G-8')
                    }
                  >
                    <div className="fovo-mini-swatch" style={{ background: m.accent }}>
                      <span>{m.language.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div>
                      <strong>{m.title}</strong>
                      <small>{m.genre} · {m.runtime}</small>
                    </div>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="fovo-mini-slate"
                  onClick={() => go('movies')}
                >
                  <div className="fovo-mini-swatch" style={{ background: '#1B2430' }}>
                    <span>IN</span>
                  </div>
                  <div>
                    <strong>Explore Live Indian Releases</strong>
                    <small>Now Showing · New Releases · Coming Soon</small>
                  </div>
                </button>
              )}
            </div>
          </div>
        </article>

        {/* STEP 02 — Offset asymmetrical composition */}
        <article className="fovo-step-row fovo-step-row--02">
          <div className="fovo-step-visual fovo-step-visual--dark">
            <div className="fovo-step-angleDiagram">
              <svg viewBox="0 0 520 240" aria-label="First-person sightline cone">
                <rect width="520" height="240" fill="#0B0B0D" />
                <line x1="56" y1="30" x2="56" y2="210" stroke="#E5B84B" strokeWidth="5" />
                <polygon points="56,42 420,120 56,198" fill="#E5B84B" fillOpacity="0.18" />
                <line x1="56" y1="42" x2="420" y2="120" stroke="#E5B84B" strokeDasharray="4 4" />
                <line x1="56" y1="198" x2="420" y2="120" stroke="#E5B84B" strokeDasharray="4 4" />
                <circle cx="420" cy="120" r="10" fill="#FF813D" />
                <text x="76" y="36" fill="#F5F5F2" fontSize="11" fontFamily="Manrope, sans-serif">
                  SCREEN PLANE (Z = 0m)
                </text>
                <text x="330" y="154" fill="#FF813D" fontSize="12" fontWeight="700" fontFamily="Manrope, sans-serif">
                  EYE POSE · 42° FOV
                </text>
              </svg>
            </div>
          </div>
          <div className="fovo-step-num">02</div>
          <div className="fovo-step-text">
            <span className="fovo-step-pill fovo-step-pill--orange">FIRST-PERSON PREVIEW</span>
            <h3>Experience your seat.</h3>
            <p>
              Select any available seat and see the movie from your own perspective—complete with
              authentic riser elevation, trailer projection and spatial headphone audio.
            </p>
            <button
              type="button"
              className="fovo-btn-outline"
              onClick={() => openFullExperience('G-8')}
            >
              Launch 3D Seat Preview →
            </button>
          </div>
        </article>

        {/* STEP 03 — Comparison ticket receipt composition */}
        <article className="fovo-step-row fovo-step-row--03">
          <div className="fovo-step-num">03</div>
          <div className="fovo-step-text">
            <span className="fovo-step-pill fovo-step-pill--dark">PIN &amp; CONFIRM</span>
            <h3>Book your view.</h3>
            <p>
              Pin any two seats to compare distance, angle and price side-by-side, then proceed
              directly to a clean checkout with zero surprises when you walk into the auditorium.
            </p>
            <button
              type="button"
              className="fovo-btn-lime"
              onClick={() => openFullExperience('G-8')}
            >
              <span className="fovo-btn-dot" />
              Compare &amp; Book Now
            </button>
          </div>
          <div className="fovo-step-visual fovo-ruled-grid">
            <div className="fovo-compare-specimen">
              <div className="fovo-specimen-col">
                <span className="fovo-eyebrow">PINNED SEAT A</span>
                <strong>G-8 · Classic Plus</strong>
                <span>11.5 m · Centred · 45° FOV</span>
                <span className="fovo-specimen-price">₹270</span>
              </div>
              <div className="fovo-specimen-vs">VS</div>
              <div className="fovo-specimen-col">
                <span className="fovo-eyebrow">CANDIDATE SEAT B</span>
                <strong>B-9 · Prime Recliner</strong>
                <span>17.4 m · Centred · 34° FOV</span>
                <span className="fovo-specimen-price">₹330</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* ================================================================
          SPATIAL AUDIO (DARK + ORANGE GEOMETRIC SPLIT)
      ================================================================ */}
      <section className="fovo-audio fovo-reveal" id="technology">
        <div className="fovo-audio-left">
          <span className="fovo-eyebrow">SPATIAL HEADPHONE ENGINE</span>
          <h2>Don’t just watch. Feel the atmosphere.</h2>
          <p className="fovo-audio-lead">
            An immersive audio experience that brings the cinema environment closer to you.
          </p>
          <p className="fovo-audio-body">
            FOVO routes the trailer soundtrack through dual virtual screen speakers using Web Audio
            HRTF panning, distance-based low-pass filtering and custom auditorium convolution
            reverb. As you glide from the front lounger row to the back Prime risers, the acoustic
            perspective shifts in real time.
          </p>

          <div className="fovo-audio-SeatTabs" role="group" aria-label="Sample listener position">
            <button
              type="button"
              className={audioSeatId === 'L-3' ? 'on' : ''}
              onClick={() => setAudioSeatId('L-3')}
            >
              Front Left (L-3)
            </button>
            <button
              type="button"
              className={audioSeatId === 'G-8' ? 'on' : ''}
              onClick={() => setAudioSeatId('G-8')}
            >
              Centre Reference (G-8)
            </button>
            <button
              type="button"
              className={audioSeatId === 'B-15' ? 'on' : ''}
              onClick={() => setAudioSeatId('B-15')}
            >
              Rear Right (B-15)
            </button>
          </div>

          <p className="fovo-audio-disclaimer">
            Compatible with standard stereo headphones via Web Audio API spatial simulation and
            automatic stereo fallback. Not marketed or decoded as Dolby Atmos.
          </p>
        </div>

        <div className="fovo-audio-right">
          <div className="fovo-audio-disc">
            <svg viewBox="0 0 500 500" aria-label="Spatial sound propagation diagram">
              <circle cx="250" cy="250" r="236" fill="#0B0B0D" />
              {/* Concentric propagation rings */}
              {[90, 150, 210, 270, 330].map((r, idx) => (
                <circle
                  key={`l-${r}`}
                  className="fovo-wave-ring"
                  style={{ animationDelay: `${idx * 0.35}s` }}
                  cx="170"
                  cy="96"
                  r={r}
                  fill="none"
                  stroke="#303034"
                  strokeDasharray="4 6"
                />
              ))}
              {[90, 150, 210, 270, 330].map((r, idx) => (
                <circle
                  key={`r-${r}`}
                  className="fovo-wave-ring"
                  style={{ animationDelay: `${idx * 0.35 + 0.18}s` }}
                  cx="330"
                  cy="96"
                  r={r}
                  fill="none"
                  stroke="#303034"
                  strokeDasharray="4 6"
                />
              ))}

              {/* Screen bar */}
              <line x1="120" y1="88" x2="380" y2="88" stroke="#F5F5F2" strokeWidth="6" />
              <circle cx="170" cy="96" r="9" fill="#E5B84B" />
              <circle cx="330" cy="96" r="9" fill="#E5B84B" />
              <text x="250" y="68" textAnchor="middle" fill="#E5B84B" fontSize="11" fontFamily="Manrope, sans-serif" letterSpacing="2">
                VIRTUAL L / R SCREEN ARRAYS
              </text>

              {/* Dynamic listener coordinate */}
              {(() => {
                const coords =
                  audioSeatId === 'L-3'
                    ? { x: 175, y: 195, label: 'L-3 · DIRECT NEAR-FIELD (15.8 kHz LP)' }
                    : audioSeatId === 'B-15'
                    ? { x: 325, y: 370, label: 'B-15 · DEEP ROOM REVERB (11.5 kHz LP)' }
                    : { x: 250, y: 275, label: 'G-8 · BALANCED HRTF SWEET SPOT' };
                return (
                  <g className="fovo-listener-node">
                    <line
                      className="fovo-sound-ray"
                      x1="170"
                      y1="96"
                      x2={coords.x}
                      y2={coords.y}
                      stroke="#E5B84B"
                      strokeWidth="2"
                    />
                    <line
                      className="fovo-sound-ray"
                      x1="330"
                      y1="96"
                      x2={coords.x}
                      y2={coords.y}
                      stroke="#FF813D"
                      strokeWidth="2"
                    />
                    <circle
                      className="fovo-listener-halo"
                      cx={coords.x}
                      cy={coords.y}
                      r="28"
                      fill="#E5B84B"
                      fillOpacity="0.2"
                    />
                    <circle cx={coords.x} cy={coords.y} r="10" fill="#E5B84B" />
                    <text
                      x="250"
                      y="438"
                      textAnchor="middle"
                      fill="#F5F5F2"
                      fontSize="12"
                      fontWeight="600"
                      fontFamily="Manrope, sans-serif"
                    >
                      {coords.label}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>
      </section>

      {/* ================================================================
          EVERY SEAT IS DIFFERENT
      ================================================================ */}
      <section className="fovo-every fovo-reveal">
        <div className="fovo-every-head">
          <div>
            <h2 className="fovo-section-title">Every seat has its own perspective.</h2>
          </div>
          <p className="fovo-every-copy">
            Four distinct seating categories—Prime, Classic Plus, Classic and Lounger—each with its
            own row pitch, riser height and viewing geometry. Select a preset or click any seat in
            the 183-seat auditorium map to inspect its sightline.
          </p>
        </div>

        {/* Four category strips */}
        <div className="fovo-tier-strip">
          {[
            { id: 'prime', name: 'PRIME ROWS', rows: 'Rows A – C · 51 Recliners', price: '₹330', sample: 'A-9' },
            { id: 'classicPlus', name: 'CLASSIC PLUS ROWS', rows: 'Rows D – I · 90 Seats', price: '₹270', sample: 'G-8' },
            { id: 'classic', name: 'CLASSIC ROWS', rows: 'Rows J – K · 30 Seats', price: '₹250', sample: 'J-8' },
            { id: 'lounger', name: 'LOUNGER ROWS', rows: 'Row L · 12 Front Loungers', price: '₹290', sample: 'L-6' },
          ].map((tier) => (
            <button
              key={tier.id}
              type="button"
              className={'fovo-tier-card' + (explorerSeat.section === tier.id ? ' on' : '')}
              onClick={() => setExplorerSeatId(tier.sample)}
            >
              <div className="fovo-tier-top">
                <strong>{tier.name}</strong>
                <span>{tier.price}</span>
              </div>
              <small>{tier.rows}</small>
            </button>
          ))}
        </div>

        <div className="fovo-every-grid">
          <div className="fovo-every-map fovo-ruled-grid">
            <div className="fovo-card-topline">
              <span className="fovo-pill-dark">183-SEAT CONFIGURABLE AUDITORIUM</span>
              <span className="fovo-mono">CLICK ANY AVAILABLE SEAT</span>
            </div>
            <SeatMap
              config={referenceAuditorium}
              seats={seats}
              availability={availability}
              selectedId={explorerSeat.id}
              onSelect={setExplorerSeatId}
            />
          </div>

          <div className="fovo-every-preview">
            <IllustratedFirstPerson
              seatId={explorerSeat.id}
              badge={`${referenceAuditorium.sections[explorerSeat.section].label.toUpperCase()} · ${explorerSeat.id}`}
              onSelectPreset={setExplorerSeatId}
            />
            <div className="fovo-every-summary">
              <div>
                <strong>
                  Seat {explorerSeat.id} · {referenceAuditorium.sections[explorerSeat.section].label}
                </strong>
                <p>{explorerStats.verdict}</p>
              </div>
              <button
                type="button"
                className="fovo-btn-lime"
                onClick={() => openFullExperience(explorerSeat.id)}
              >
                <span className="fovo-btn-dot" />
                Enter Seat {explorerSeat.id} in 3D
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          FINAL CALL TO ACTION
      ================================================================ */}
      <section className="fovo-final-cta fovo-reveal">
        <div className="fovo-final-left">
          <h2>Find your view.</h2>
          <p>Your next movie experience starts before you book.</p>
        </div>
        <div className="fovo-final-right">
          <button type="button" className="fovo-final-button" onClick={() => go('movies')}>
            <span>Explore FOVO</span>
            <span className="fovo-final-arrow">↗</span>
          </button>
          <button
            type="button"
            className="fovo-final-sublink"
            onClick={() => openFullExperience('G-8')}
          >
            Or jump straight into Seat G-8 in the 3D auditorium →
          </button>
        </div>
      </section>

      {/* ================================================================
          FOOTER
      ================================================================ */}
      <footer className="fovo-footer">
        <div className="fovo-footer-links">
          <div className="fovo-footer-col">
            <span className="fovo-eyebrow">NAVIGATION</span>
            <button type="button" onClick={() => scrollToSection('experience')}>
              Experience
            </button>
            <button type="button" onClick={() => scrollToSection('how-it-works')}>
              How it works
            </button>
            <button type="button" onClick={() => scrollToSection('technology')}>
              About &amp; Technology
            </button>
            <button type="button" onClick={() => go('movies')}>
              Book a Showtime
            </button>
          </div>

          <div className="fovo-footer-col">
            <span className="fovo-eyebrow">CONTACT</span>
            <a href="mailto:hello@fovo.cinema">hello@fovo.cinema</a>
            <a href="#top" onClick={(e) => { e.preventDefault(); openFullExperience('G-8'); }}>
              Launch Demo Auditorium
            </a>
          </div>

          <div className="fovo-footer-col">
            <span className="fovo-eyebrow">SOCIAL</span>
            <a href="https://github.com/shreemanthKunthe/-CineShow" target="_blank" rel="noreferrer">
              GitHub Repository ↗
            </a>
            <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              Back to top ↑
            </a>
          </div>

          <div className="fovo-footer-col fovo-footer-meta">
            <span className="fovo-eyebrow">FOVO — FIELD OF VIEW</span>
            <p>Your seat. Your view. First-person cinema seat preview &amp; simulated booking platform.</p>
            <small>© {new Date().getFullYear()} FOVO Labs. Prototype experience.</small>
          </div>
        </div>

        {/* Giant editorial footer wordmark */}
        <div className="fovo-footer-giant" aria-hidden="true">
          <span>FO</span>
          <span className="fovo-footer-screenCutout">
            <em>2.39:1</em>
          </span>
          <span>VO</span>
        </div>
      </footer>
    </div>
  );
}
