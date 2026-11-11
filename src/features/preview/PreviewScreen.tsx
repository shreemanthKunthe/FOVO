import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBooking } from '../../store/bookingStore';
import { useShow } from '../../store/useShow';
import { useViewStore } from '../../store/viewStore';
import { neighbourSeat, type Direction } from '../../domain/navigation';
import { describeAngle, viewingStats } from '../../domain/viewing';
import type { AuditoriumConfig, Seat } from '../../domain/types';
import { SeatMap } from '../seatmap/SeatMap';
import { Legend } from '../seatmap/SeatInfo';
import { trailer, useTrailer } from '../trailer/TrailerController';
import Scene from './scene/Scene';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Fallback when WebGL is unavailable: a top-down sightline diagram with the same numbers. */
function SightlineFallback({ seat, config }: { seat: Seat; config: AuditoriumConfig }) {
  const W = config.dims.width;
  const L = config.dims.length;
  const sx = 280 / W;
  const px = (x: number) => 20 + (x + W / 2) * sx;
  const pz = (z: number) => 20 + z * sx;
  const [x, , z] = seat.world.position;
  const half = config.screen.width / 2;
  return (
    <div className="fallback">
      <h2>3D preview unavailable on this device</h2>
      <p className="muted">Showing a top-down sightline instead. Seat details are still accurate.</p>
      <svg viewBox={`0 0 320 ${pz(L) + 20}`} width="320" role="img" aria-label="Top-down sightline from the selected seat to the screen">
        <line x1={px(-half)} y1={pz(0)} x2={px(half)} y2={pz(0)} stroke="#6f87b0" strokeWidth="4" />
        <polygon points={`${px(x)},${pz(z)} ${px(-half)},${pz(0)} ${px(half)},${pz(0)}`} fill="#f2e6c9" opacity="0.15" />
        <circle cx={px(x)} cy={pz(z)} r="5" fill="#f2e6c9" />
      </svg>
    </div>
  );
}

const fmt = (seat: Seat, config: AuditoriumConfig) => {
  const st = viewingStats(seat, config);
  return {
    distance: `${st.distance.toFixed(1)} m`,
    angle: describeAngle(st),
    fill: `${Math.round(st.coverageDeg)}°`,
    price: `₹${config.sections[seat.section].price}`,
  };
};

export default function PreviewScreen() {
  const show = useShow();
  const seatId = useBooking((s) => s.selectedSeatId);
  const pinnedId = useBooking((s) => s.pinnedSeatId);
  const selectSeat = useBooking((s) => s.selectSeat);
  const pinSeat = useBooking((s) => s.pinSeat);
  const go = useBooking((s) => s.go);
  const quality = useViewStore((s) => s.quality);
  const setQuality = useViewStore((s) => s.setQuality);
  const recenter = useViewStore((s) => s.recenter);
  const t = useTrailer();

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const webgl = useMemo(hasWebGL, []);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 820);
  const [fullscreen, setFullscreen] = useState(false);

  const movie = show?.movie;
  const config = show?.config;
  useEffect(() => {
    if (!movie || !config) return;
    trailer.enter(
      { id: movie.id, title: movie.title, accent: movie.accent, url: movie.trailerUrl },
      { width: config.screen.width, centerY: config.screen.bottomY + config.screen.height / 2 },
    );
    return () => trailer.leave();
  }, [movie, config]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const seat = show?.seats.find((s) => s.id === seatId) ?? null;

  const move = (dir: Direction) => {
    if (!show || !seat) return;
    const n = neighbourSeat(show.seats, show.availability, seat, dir);
    if (n) selectSeat(n.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,button,[role=button]')) return;
      const map: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'front', ArrowDown: 'back' };
      if (map[e.key]) {
        e.preventDefault();
        move(map[e.key]);
      } else if (e.key === ' ') {
        e.preventDefault();
        trailer.toggle();
      } else if (e.key.toLowerCase() === 'm') trailer.setMuted(!useTrailer.getState().muted);
      else if (e.key.toLowerCase() === 'r') recenter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!show || !seat) return null;
  const pinned = pinnedId && pinnedId !== seat.id ? show.seats.find((s) => s.id === pinnedId) ?? null : null;
  const sec = show.config.sections[seat.section];
  const cur = fmt(seat, show.config);
  const pin = pinned ? fmt(pinned, show.config) : null;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  return (
    <div className="preview" ref={rootRef}>
      <div className="stage">
        {webgl ? (
          <SceneBoundary fallback={<SightlineFallback seat={seat} config={show.config} />}>
            <Suspense fallback={<div className="loading">Preparing auditorium…</div>}>
              <Scene config={show.config} seats={show.seats} availability={show.availability} seat={seat} quality={quality} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <SightlineFallback seat={seat} config={show.config} />
        )}
      </div>

      <header className="hud-top">
        <button className="hud-btn" onClick={() => go('seats')}>← Seat map</button>
        <div className="hud-title">
          <strong>{show.movie.title}</strong>
          <span>{show.cinema.name} · {show.time}</span>
        </div>
      </header>

      {t.needsGesture && (
        <button className="gesture" onClick={() => void trailer.play()}>Tap to enable sound and play</button>
      )}

      <div className="hud-bar" role="group" aria-label="Trailer controls">
        <button className="hud-btn" onClick={() => trailer.toggle()} aria-label={t.playing ? 'Pause' : 'Play'}>{t.playing ? 'Pause' : 'Play'}</button>
        <button className="hud-btn" onClick={() => trailer.setMuted(!t.muted)} aria-pressed={t.muted}>{t.muted ? 'Unmute' : 'Mute'}</button>
        <input
          type="range" min={0} max={1} step={0.01} value={t.muted ? 0 : t.volume}
          onChange={(e) => trailer.setVolume(Number(e.target.value))} aria-label="Volume"
        />
        <label className="toggle">
          <input type="checkbox" checked={t.spatial} onChange={(e) => trailer.setSpatial(e.target.checked)} />
          Spatial audio
        </label>
        <button className="hud-btn" onClick={recenter}>Recentre view</button>
        <button className="hud-btn" onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
        <button className="hud-btn" onClick={() => fileRef.current?.click()}>Load trailer file</button>
        <button className="hud-btn" onClick={() => setQuality(quality === 'high' ? 'low' : 'high')}>Quality: {quality === 'high' ? 'High' : 'Low'}</button>
        <input
          ref={fileRef} type="file" accept="video/*" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) trailer.loadFile(f, { id: show.movie.id, title: show.movie.title, accent: show.movie.accent });
            e.target.value = '';
          }}
        />
      </div>
      <p className="hud-note" aria-live="polite">
        {t.source === 'synthetic' ? `${t.note} ` : ''}
        Spatial audio is a headphone simulation, not Dolby Atmos. Drag to look around · arrow keys switch seats.
      </p>

      <aside className={'panel' + (panelOpen ? '' : ' collapsed')}>
        <div className="panel-head">
          <div>
            <h2>Seat {seat.id}</h2>
            <span className="muted">Row {seat.row} · {sec.label} · {cur.price}</span>
          </div>
          <button className="hud-btn" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>{panelOpen ? 'Hide' : 'Details'}</button>
        </div>

        <div className="panel-body">
          {pin ? (
            <table className="compare">
              <thead><tr><th></th><th>{seat.id} (now)</th><th>{pinned!.id} (pinned)</th></tr></thead>
              <tbody>
                <tr><td>Distance</td><td>{cur.distance}</td><td>{pin.distance}</td></tr>
                <tr><td>Angle</td><td>{cur.angle}</td><td>{pin.angle}</td></tr>
                <tr><td>Screen fills</td><td>{cur.fill}</td><td>{pin.fill}</td></tr>
                <tr><td>Price</td><td>{cur.price}</td><td>{pin.price}</td></tr>
              </tbody>
            </table>
          ) : (
            <dl className="stats">
              <div><dt>Distance to screen</dt><dd>{cur.distance}</dd></div>
              <div><dt>Viewing angle</dt><dd>{cur.angle}</dd></div>
              <div><dt>Screen fills</dt><dd>{cur.fill} of view</dd></div>
            </dl>
          )}
          <p className="verdict">{viewingStats(seat, show.config).verdict}</p>

          <div className="dpad" role="group" aria-label="Move to a nearby seat">
            <button onClick={() => move('front')} aria-label="Row closer to screen">▲</button>
            <button onClick={() => move('left')} aria-label="Seat to the left">◀</button>
            <button onClick={() => move('back')} aria-label="Row farther from screen">▼</button>
            <button onClick={() => move('right')} aria-label="Seat to the right">▶</button>
          </div>

          <div className="row-actions">
            {pinned && (
              <button className="ghost" onClick={() => { selectSeat(pinned.id); pinSeat(seat.id); }}>Switch to {pinned.id}</button>
            )}
            <button className="ghost" onClick={() => pinSeat(pinnedId === seat.id ? null : pinned ? seat.id : seat.id)}>
              {pinned ? 'Pin this instead' : pinnedId === seat.id ? 'Unpin' : 'Pin to compare'}
            </button>
            {pinned && <button className="ghost" onClick={() => pinSeat(null)}>Clear pin</button>}
          </div>

          <SeatMap
            compact
            config={show.config}
            seats={show.seats}
            availability={show.availability}
            selectedId={seat.id}
            pinnedId={pinnedId}
            onSelect={selectSeat}
          />
          <Legend />
        </div>

        <button className="primary confirm" onClick={() => go('checkout')}>Confirm seat {seat.id} · {cur.price}</button>
      </aside>
    </div>
  );
}

