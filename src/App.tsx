import { Suspense, useState } from 'react';
import { useBooking, type Step } from './store/bookingStore';
import { MovieList, ShowtimePicker } from './features/browse/Browse';
import { SeatSelection } from './features/seats/SeatSelection';
import { Checkout, Confirmation } from './features/booking/Checkout';
import { PreviewScreen } from './features/preview/lazy';
import { LandingPage } from './features/landing/LandingPage';
import { Preloader, hasSeenPreloader } from './features/preloader/Preloader';

const STEPS: { id: Step; label: string }[] = [
  { id: 'movies', label: 'Movies' },
  { id: 'showtimes', label: 'Showtimes' },
  { id: 'seats', label: 'Seating' },
  { id: 'preview', label: 'First-Person View' },
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
      <button
        type="button"
        className="logo-btn"
        onClick={() => go('landing')}
        aria-label="Return to FOVO home"
      >
        FOVO
      </button>
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
      <button
        type="button"
        className="topbar-home-link"
        onClick={() => go('landing')}
      >
        Home
      </button>
    </header>
  );
}

export function App() {
  const [preloading, setPreloading] = useState<boolean>(() => !hasSeenPreloader());
  const step = useBooking((s) => s.step);

  if (preloading) {
    return <Preloader onComplete={() => setPreloading(false)} />;
  }

  if (step === 'landing') {
    return <LandingPage />;
  }

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
