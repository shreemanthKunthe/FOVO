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
  const when = new Date(show.date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="summary">
      <strong>{show.movie.title}</strong>
      <span className="muted">{show.cinema.name} · {show.cinema.format}</span>
      <span className="muted">{when} · {show.time}</span>
      <button className="link" onClick={() => go('showtimes')}>Change showtime</button>
    </div>
  );
}

export function SeatSelection() {
  const show = useShow();
  const selectedId = useBooking((s) => s.selectedSeatId);
  const selectSeat = useBooking((s) => s.selectSeat);
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
          <h2>Choose your seat</h2>
          <span className="muted">{left} of {show.seats.length} available · scroll or use + / − to zoom, drag to pan</span>
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
            <button className="primary" onClick={() => go('preview')}>Experience this seat</button>
            <button className="ghost" onClick={() => go('checkout')}>Skip preview and book</button>
          </>
        ) : (
          <p className="muted empty">Select an available seat to see the movie from there.</p>
        )}
      </aside>
    </div>
  );
}

