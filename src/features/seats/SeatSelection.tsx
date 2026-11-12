import { useEffect } from 'react';
import { useBooking } from '../../store/bookingStore';
import { useShow } from '../../store/useShow';
import { SeatMap } from '../seatmap/SeatMap';
import { Legend, SeatCard } from '../seatmap/SeatInfo';
import { prefetchPreview } from '../preview/lazy';

export function ShowSummary() {
  const show = useShow();
  const go = useBooking((s) => s.go);
  if (!show) return null;
  const when = new Date(show.date + 'T00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return (
    <div className="summary">
      <div className="summary-badges">
        <span className="eyebrow-pill">{show.cinema.city.toUpperCase()}</span>
        <span
          className={
            'verify-badge ' +
            (show.config.verificationStatus === 'VERIFIED_LAYOUT' ? 'verified' : 'estimated')
          }
        >
          {show.config.verificationStatus === 'VERIFIED_LAYOUT'
            ? 'VERIFIED LAYOUT'
            : show.config.verificationStatus === 'VISTA_GRID_CALIBRATED'
              ? 'VISTA SEATPLAN CALIBRATED'
              : 'ESTIMATED PROTOTYPE LAYOUT'}
        </span>
      </div>
      <strong>{show.movie.title}</strong>
      <span className="muted">
        {show.cinema.name} · {show.config.name}
      </span>
      <span className="muted">{show.cinema.address}</span>
      <span className="muted">
        {when} · {show.time} ({show.movie.language})
      </span>
      <button className="link" onClick={() => go('showtimes')}>
        Change cinema, auditorium or showtime
      </button>
    </div>
  );
}

export function SeatSelection() {
  const show = useShow();
  const selectedId = useBooking((s) => s.selectedSeatId);
  const selectSeat = useBooking((s) => s.selectSeat);
  const setAuditorium = useBooking((s) => s.setAuditorium);
  const go = useBooking((s) => s.go);

  // Warm the 3D chunk while the user is choosing a seat so entering the preview is instant.
  useEffect(() => prefetchPreview(), []);

  if (!show) return null;
  const seat = show.seats.find((s) => s.id === selectedId) ?? null;
  const left = Object.values(show.availability).filter((v) => v === 'available').length;

  return (
    <div className="seat-layout">
      <section className="card map-card">
        <header className="map-head">
          <div className="map-head-top">
            <div>
              <h2>{show.config.name}</h2>
              <span className="muted">
                Screen {show.config.screen.width.toFixed(1)}m × {show.config.screen.height.toFixed(1)}m · Room{' '}
                {show.config.dims.width}m × {show.config.dims.length}m · {show.seats.length} seats ({show.config.rows.length} rows)
              </span>
            </div>
            <span
              className={
                'verify-badge ' +
                (show.availabilitySource === 'VISTA_SESSION_SEATPLAN' ? 'verified' : 'demo')
              }
            >
              {show.availabilitySource === 'VISTA_SESSION_SEATPLAN'
                ? 'AVAILABILITY: VISTA SEATPLAN'
                : 'AVAILABILITY: DEMO DATA'}
            </span>
          </div>

          {show.cinema.auditoriums.length > 1 && (
            <div className="auditorium-SubTabs" role="tablist" aria-label="Switch auditorium screen">
              <span className="muted">Auditorium:</span>
              {show.cinema.auditoriums.map((audi) => (
                <button
                  key={audi.id}
                  type="button"
                  role="tab"
                  aria-selected={show.config.id === audi.id}
                  className={'city-pill' + (show.config.id === audi.id ? ' on' : '')}
                  onClick={() => setAuditorium(audi.id)}
                >
                  {audi.name}
                </button>
              ))}
            </div>
          )}

          <span className="muted">
            {left} of {show.seats.length} seats available · scroll or use + / − to zoom, drag to pan
          </span>
          {show.config.verificationNotes && (
            <p className="layout-verify-note">{show.config.verificationNotes}</p>
          )}
        </header>
        <SeatMap
          config={show.config}
          seats={show.seats}
          availability={show.availability}
          selectedId={selectedId}
          onSelect={selectSeat}
        />
        <Legend />
      </section>

      <aside className="card side">
        <ShowSummary />
        {seat ? (
          <>
            <SeatCard seat={seat} config={show.config} />
            <button className="primary" onClick={() => go('preview')}>
              Experience Seat {seat.id} in 3D
            </button>
            <button className="ghost" onClick={() => go('checkout')}>
              Skip preview &amp; proceed to booking handoff
            </button>
          </>
        ) : (
          <p className="muted empty">
            Select any available seat in the auditorium map to inspect its sightline and experience the first-person 3D view.
          </p>
        )}
      </aside>
    </div>
  );
}
