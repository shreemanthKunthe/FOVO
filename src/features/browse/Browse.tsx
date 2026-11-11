import { getMovie, movies } from '../../data/movies';
import { cinemas, isPast, nextDates, SHOW_TIMES } from '../../data/cinemas';
import { getSeats } from '../../domain/layout/generateSeats';
import { mockAvailability } from '../../data/mockAvailability';
import { useBooking } from '../../store/bookingStore';
import { useState } from 'react';

export function MovieList() {
  const selectMovie = useBooking((s) => s.selectMovie);
  return (
    <section>
      <h1 className="page-title">Now showing</h1>
      <p className="muted">Pick a film, then choose where to sit and see it from that seat.</p>
      <div className="movie-grid">
        {movies.map((m) => (
          <button key={m.id} className="movie-card" onClick={() => selectMovie(m.id)}>
            <div className="poster" style={{ background: m.accent }}>
              <span>{m.title}</span>
            </div>
            <div className="movie-meta">
              <strong>{m.title}</strong>
              <span className="muted">{m.genre}</span>
              <span className="muted">{m.runtime} · {m.rating} · {m.language}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ShowtimePicker() {
  const movieId = useBooking((s) => s.movieId);
  const selectShow = useBooking((s) => s.selectShow);
  const movie = getMovie(movieId);
  const dates = nextDates(3);
  const [date, setDate] = useState(dates[0].key);
  if (!movie) return null;

  return (
    <section className="showtimes">
      <div className="movie-hero">
        <div className="poster small" style={{ background: movie.accent }}><span>{movie.title}</span></div>
        <div>
          <h1 className="page-title">{movie.title}</h1>
          <p className="muted">{movie.genre} · {movie.runtime} · {movie.rating} · {movie.language}</p>
          <p className="synopsis">{movie.synopsis}</p>
        </div>
      </div>

      <div className="chips" role="tablist" aria-label="Date">
        {dates.map((d) => (
          <button key={d.key} role="tab" aria-selected={date === d.key} className={'chip' + (date === d.key ? ' on' : '')} onClick={() => setDate(d.key)}>
            <strong>{d.label}</strong><small>{d.day}</small>
          </button>
        ))}
      </div>

      <div className="cinema-list">
        {cinemas.map((c) => {
          const seats = getSeats(c.auditorium);
          const prices = Object.values(c.auditorium.sections).map((s) => s.price);
          return (
            <div key={c.id} className="card cinema">
              <div className="cinema-head">
                <div>
                  <h3>{c.name}</h3>
                  <span className="muted">{c.area} · {c.format}</span>
                </div>
                <span className="muted">₹{Math.min(...prices)} – ₹{Math.max(...prices)} · {seats.length} seats</span>
              </div>
              <div className="times">
                {SHOW_TIMES.map((t) => {
                  const past = isPast(date, t);
                  const left = Object.values(mockAvailability(seats, `${c.id}|${date}|${t}`)).filter((v) => v === 'available').length;
                  return (
                    <button key={t} className="time" disabled={past} onClick={() => selectShow(c.id, date, t)}>
                      <strong>{t}</strong>
                      <small>{past ? 'Started' : `${left} left`}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

