import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBooking } from '../../store/bookingStore';
import { useShow } from '../../store/useShow';
import { useViewStore } from '../../store/viewStore';
import { neighbourSeat, type Direction } from '../../domain/navigation';
import { describeAngle, viewingStats } from '../../domain/viewing';
import type { AuditoriumConfig, Seat } from '../../domain/types';
import { getPrimaryTrailer } from '../../data/movies';
import { fetchMovieFullDetails } from '../../services/tmdbClient';
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
        <line x1={px(-half)} y1={pz(0)} x2={px(half)} y2={pz(0)} stroke="#E5B84B" strokeWidth="4" />
        <polygon points={`${px(x)},${pz(z)} ${px(-half)},${pz(0)} ${px(half)},${pz(0)}`} fill="#E5B84B" opacity="0.18" />
        <circle cx={px(x)} cy={pz(z)} r="5" fill="#E5B84B" />
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
  const trailerLanguage = useBooking((s) => s.trailerLanguage);
  const selectSeat = useBooking((s) => s.selectSeat);
  const pinSeat = useBooking((s) => s.pinSeat);
  const setTrailerLanguage = useBooking((s) => s.setTrailerLanguage);
  const go = useBooking((s) => s.go);
  const quality = useViewStore((s) => s.quality);
  const setQuality = useViewStore((s) => s.setQuality);
  const recenter = useViewStore((s) => s.recenter);
  const t = useTrailer();

  const rootRef = useRef<HTMLDivElement>(null);
  const stagePlaneRef = useRef<HTMLDivElement>(null);
  const cameraPlaneRef = useRef<HTMLDivElement>(null);
  const screenPlaneRef = useRef<HTMLDivElement>(null);
  const ytMountRef = useRef<HTMLDivElement>(null);

  const webgl = useMemo(hasWebGL, []);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 860);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [enrichedMovie, setEnrichedMovie] = useState(show?.movie ?? null);

  const baseMovie = show?.movie ?? null;
  const movie = enrichedMovie?.id === baseMovie?.id ? enrichedMovie : baseMovie;
  const config = show?.config;

  // Ensure full trailer metadata is resolved for the selected movie
  useEffect(() => {
    if (!baseMovie) return;
    setEnrichedMovie(baseMovie);
    if (baseMovie.trailers.length === 0) {
      let active = true;
      fetchMovieFullDetails(baseMovie).then((full) => {
        if (active) setEnrichedMovie(full);
      });
      return () => {
        active = false;
      };
    }
  }, [baseMovie]);

  const activeTrailer = useMemo(
    () => (movie ? getPrimaryTrailer(movie, trailerLanguage ?? undefined) : null),
    [movie, trailerLanguage],
  );

  // Register 3D screen-plane DOM nodes for CSS3D homography projection
  useEffect(() => {
    trailer.setScreenPlaneElements(
      stagePlaneRef.current,
      cameraPlaneRef.current,
      screenPlaneRef.current,
    );
    trailer.attachYouTubeContainer(ytMountRef.current);
    return () => {
      trailer.attachYouTubeContainer(null);
      trailer.setScreenPlaneElements(null, null, null);
    };
  }, []);

  // Start trailer playback on the 3D auditorium screen when entering or changing trailer
  useEffect(() => {
    if (!movie || !config) return;
    trailer.enter(
      {
        id: movie.id,
        title: movie.title,
        originalTitle: movie.originalTitle,
        accent: movie.accent,
        url: movie.trailerUrl,
        trailerMeta: activeTrailer,
      },
      { width: config.screen.width, centerY: config.screen.bottomY + config.screen.height / 2 },
    );
    return () => trailer.leave();
  }, [movie, config, activeTrailer]);

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
      if ((e.target as HTMLElement).closest('input,button,select,[role=button]')) return;
      const map: Record<string, Direction> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'front',
        ArrowDown: 'back',
      };
      if (map[e.key]) {
        e.preventDefault();
        move(map[e.key]);
      } else if (e.key === ' ') {
        e.preventDefault();
        trailer.toggle();
      } else if (e.key.toLowerCase() === 'm') {
        trailer.setMuted(!useTrailer.getState().muted);
      } else if (e.key.toLowerCase() === 'r') {
        recenter();
      } else if (e.key.toLowerCase() === 'h') {
        setControlsHidden((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!show || !seat || !movie) return null;
  const pinned = pinnedId && pinnedId !== seat.id ? show.seats.find((s) => s.id === pinnedId) ?? null : null;
  const sec = show.config.sections[seat.section];
  const st = viewingStats(seat, show.config);
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
              <Scene
                config={show.config}
                seats={show.seats}
                availability={show.availability}
                seat={seat}
                quality={quality}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          <SightlineFallback seat={seat} config={show.config} />
        )}

        {/*
          3D Screen-Plane-Aligned Video Surface:
          Projected onto world coordinates [0, cy, 0] (fw × fh metres) every frame by ScreenMesh.tsx.
          Pointer-events are disabled on the surface so dragging anywhere rotates the first-person camera.
        */}
        <div
          ref={stagePlaneRef}
          className="screen-3d-stage"
          aria-label="Cinema auditorium projection screen"
        >
          <div ref={cameraPlaneRef} className="screen-3d-camera">
            <div
              ref={screenPlaneRef}
              className={
                'screen-3d-plane' +
                (t.source === 'video' && !t.loading && !t.error ? ' is-webgl-video' : '')
              }
            >
              {/* YouTube IFrame Player API target mounted directly on the 3D screen plane */}
              <div
                ref={ytMountRef}
                className="screen-3d-yt-mount"
                style={{
                  display: t.source === 'youtube' && t.status !== 'error' ? 'block' : 'none',
                }}
              />

              {/* Cinema Screen Loading State */}
              {t.loading && t.status !== 'error' && t.status !== 'unavailable' && (
                <div className="screen-3d-state">
                  <span className="screen-spinner" aria-hidden="true" />
                  <strong> Cueing Official Trailer…</strong>
                  <span>
                    {movie.title} ({activeTrailer?.language || movie.language})
                  </span>
                </div>
              )}

              {/* Cinema Screen Ended State */}
              {t.status === 'ended' && (
                <div className="screen-3d-state is-interactive">
                  <strong>{movie.title}</strong>
                  <span>Official trailer playback finished</span>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => trailer.replay()}
                  >
                    ⟲ Replay Trailer on Screen
                  </button>
                </div>
              )}

              {/* Cinema Screen Error or Unavailable State (never fakes playback with a poster) */}
              {(t.status === 'error' || t.status === 'unavailable') && (
                <div className="screen-3d-state is-interactive">
                  <span className="verify-badge estimated">TRAILER STREAM UNAVAILABLE</span>
                  <strong>{movie.title}</strong>
                  <span>
                    {t.error || 'Official embeddable trailer is currently unavailable for this title.'}
                  </span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => trailer.retry()}
                    >
                      ↻ Retry Trailer Stream
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top HUD Bar */}
      <header className={'hud-top' + (controlsHidden ? ' is-dimmed' : '')}>
        <button className="hud-btn" onClick={() => go('seats')}>
          ← Seat Map
        </button>
        {!controlsHidden && (
          <div className="hud-title">
            <strong>
              {movie.title} · Seat {seat.id} ({sec.label})
            </strong>
            <span>
              {show.cinema.name}, {show.cinema.city} · {show.time} ·{' '}
              <em>
                {show.config.verificationStatus === 'VERIFIED_LAYOUT'
                  ? 'Verified Auditorium'
                  : 'Estimated Prototype Layout'}
              </em>
            </span>
          </div>
        )}
        <button
          type="button"
          className="hud-btn hud-toggle-ui"
          onClick={() => setControlsHidden((v) => !v)}
          aria-pressed={controlsHidden}
          title="Toggle uninterrupted cinema view (Key: H)"
        >
          {controlsHidden ? 'Show Controls (H)' : 'Hide Controls'}
        </button>
      </header>

      {/* Autoplay / Audio Gesture Prompt */}
      {(t.needsGesture || (t.playing && t.muted)) && !controlsHidden && (
        <button
          className="gesture"
          onClick={() => {
            trailer.setMuted(false);
            void trailer.play();
          }}
        >
          Tap to Enable Cinema Sound &amp; Unmute
        </button>
      )}

      {/* Cinema Playback & Auditorium Controls Bar */}
      {!controlsHidden && (
        <>
          <div className="hud-bar" role="group" aria-label="Cinema screen and audio controls">
            <button
              className="hud-btn hud-btn-accent"
              onClick={() => trailer.toggle()}
              disabled={t.status === 'unavailable'}
              aria-label={t.playing ? 'Pause trailer' : 'Play trailer'}
            >
              {t.playing ? '❚❚ Pause' : '▶ Play'}
            </button>

            <button
              className="hud-btn"
              onClick={() => trailer.replay()}
              disabled={t.status === 'unavailable'}
              aria-label="Replay trailer from start"
            >
              ⟲ Replay
            </button>

            <button
              className="hud-btn"
              onClick={() => trailer.setMuted(!t.muted)}
              aria-pressed={t.muted}
            >
              {t.muted ? '🔇 Unmute' : '🔊 Mute'}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={t.muted ? 0 : t.volume}
              onChange={(e) => trailer.setVolume(Number(e.target.value))}
              aria-label="Trailer volume"
            />

            <label className="toggle" title="Toggle Web Audio room acoustics">
              <input
                type="checkbox"
                checked={t.spatial}
                onChange={(e) => trailer.setSpatial(e.target.checked)}
              />
              {t.source === 'video' ? 'HRTF Spatial Audio' : 'Room Ambience'}
            </label>

            {movie.trailers.length > 1 && (
              <select
                className="hud-select"
                aria-label="Select trailer language"
                value={activeTrailer?.language ?? ''}
                onChange={(e) => setTrailerLanguage(e.target.value)}
              >
                {movie.trailers.map((tr) => (
                  <option key={tr.id} value={tr.language}>
                    {tr.language} Trailer
                  </option>
                ))}
              </select>
            )}

            <button className="hud-btn" onClick={recenter}>
              Recentre View
            </button>
            <button className="hud-btn" onClick={toggleFullscreen}>
              {fullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>
            <button
              className="hud-btn"
              onClick={() => setQuality(quality === 'high' ? 'low' : 'high')}
            >
              Quality: {quality === 'high' ? 'High' : 'Low'}
            </button>
          </div>

          <p className="hud-note" aria-live="polite">
            {t.source === 'youtube'
              ? `Playing official ${activeTrailer?.language || movie.language} trailer on the 3D auditorium screen (synchronized stereo player audio + Web Audio room ambience). `
              : t.source === 'video'
                ? 'Playing direct video texture on the 3D auditorium screen with Web Audio HRTF speaker simulation. '
                : ''}
            Drag anywhere to look around · Arrow keys switch seats · Press H for uninterrupted view.
          </p>
        </>
      )}

      {/* Seat Perspective & Comparison Side Panel */}
      {!controlsHidden && (
        <aside className={'panel' + (panelOpen ? '' : ' collapsed')}>
          <div className="panel-head">
            <div>
              <h2>Seat {seat.id}</h2>
              <span className="muted">
                Row {seat.row} · {sec.label} · {cur.price}
              </span>
            </div>
            <button
              className="hud-btn"
              onClick={() => setPanelOpen(!panelOpen)}
              aria-expanded={panelOpen}
            >
              {panelOpen ? 'Hide' : 'Details'}
            </button>
          </div>

          <div className="panel-body">
            {pin ? (
              <table className="compare">
                <thead>
                  <tr>
                    <th></th>
                    <th>{seat.id} (now)</th>
                    <th>{pinned!.id} (pinned)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Distance</td>
                    <td>{cur.distance}</td>
                    <td>{pin.distance}</td>
                  </tr>
                  <tr>
                    <td>Angle</td>
                    <td>{cur.angle}</td>
                    <td>{pin.angle}</td>
                  </tr>
                  <tr>
                    <td>Screen fills</td>
                    <td>{cur.fill}</td>
                    <td>{pin.fill}</td>
                  </tr>
                  <tr>
                    <td>Price</td>
                    <td>{cur.price}</td>
                    <td>{pin.price}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <dl className="stats">
                <div>
                  <dt>Distance to screen</dt>
                  <dd>{cur.distance}</dd>
                </div>
                <div>
                  <dt>Viewing angle</dt>
                  <dd>{cur.angle}</dd>
                </div>
                <div>
                  <dt>Screen fills</dt>
                  <dd>{cur.fill} of view</dd>
                </div>
              </dl>
            )}
            <p className="verdict">{st.verdict}</p>

            <div className="dpad" role="group" aria-label="Move to a nearby seat">
              <button onClick={() => move('front')} aria-label="Row closer to screen">
                ▲
              </button>
              <button onClick={() => move('left')} aria-label="Seat to the left">
                ◀
              </button>
              <button onClick={() => move('back')} aria-label="Row farther from screen">
                ▼
              </button>
              <button onClick={() => move('right')} aria-label="Seat to the right">
                ▶
              </button>
            </div>

            <div className="row-actions">
              {pinned && (
                <button
                  className="ghost"
                  onClick={() => {
                    selectSeat(pinned.id);
                    pinSeat(seat.id);
                  }}
                >
                  Switch to {pinned.id}
                </button>
              )}
              <button
                className="ghost"
                onClick={() => pinSeat(pinnedId === seat.id ? null : seat.id)}
              >
                {pinned ? 'Pin this instead' : pinnedId === seat.id ? 'Unpin' : 'Pin to compare'}
              </button>
              {pinned && (
                <button className="ghost" onClick={() => pinSeat(null)}>
                  Clear pin
                </button>
              )}
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

          <button className="primary confirm" onClick={() => go('checkout')}>
            Proceed to Booking Handoff · Seat {seat.id} ({cur.price})
          </button>
        </aside>
      )}
    </div>
  );
}
