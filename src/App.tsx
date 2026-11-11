import { Suspense } from 'react';
import { useBooking, type Step } from './store/bookingStore';
import { MovieList, ShowtimePicker } from './features/browse/Browse';
import { SeatSelection } from './features/seats/SeatSelection';
import { Checkout, Confirmation } from './features/booking/Checkout';
import { PreviewScreen } from './features/preview/lazy';

const STEPS: { id: Step; label: string }[] = [
  { id: 'movies', label: 'Movie' },
  { id: 'showtimes', label: 'Showtime' },
  { id: 'seats', label: 'Seat' },
  { id: 'preview', label: 'Preview' },
  { id: 'checkout', label: 'Checkout' },
];

function Header() {
  const step = useBooking((s) => s.step);
  const go = useBooking((s) => s.go);
  const movieId = useBooking((s) => s.movieId);
  const date = useBooking((s) => s.date);
  const seat = useBooking((s) => s.selectedSeatId);
  const reachable: Record<string, boolean> = {
    movies: true,
    showtimes: !!movieId,
    seats: !!date,
    preview: !!seat,
    checkout: !!seat,
  };
  return (
    <header className="topbar">
      <span className="logo">CineShow</span>
      {step !== 'confirmed' && (
        <nav aria-label="Booking steps">
          {STEPS.map((s) => (
            <button
              key={s.id}
              className={'step' + (step === s.id ? ' on' : '')}
              disabled={!reachable[s.id] || step === s.id}
              aria-current={step === s.id ? 'step' : undefined}
              onClick={() => go(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}

export function App() {
  const step = useBooking((s) => s.step);

  if (step === 'preview') {
    return (
      <Suspense fallback={<div className="loading full">Preparing auditorium…</div>}>
        <PreviewScreen />
      </Suspense>
    );
  }

  return (
    <>
      <Header />
      <main className="app">
        {step === 'movies' && <MovieList />}
        {step === 'showtimes' && <ShowtimePicker />}
        {step === 'seats' && <SeatSelection />}
        {step === 'checkout' && <Checkout />}
        {step === 'confirmed' && <Confirmation />}
      </main>
    </>
  );
}
