import { useState } from 'react';
import { getCinemaProviders } from '../../data/cinemas';
import { describeAngle, viewingStats } from '../../domain/viewing';
import { useBooking } from '../../store/bookingStore';
import { useShow } from '../../store/useShow';

function HandoffNotice() {
  return (
    <div className="notice" role="note">
      <strong>Authorized Ticketing Handoff:</strong> FOVO lets you preview your exact cinema sightline and spatial acoustics before buying. Final seat selection, real-time inventory lock, and payment take place on the cinema’s authorized booking provider.
    </div>
  );
}

export function Checkout() {
  const show = useShow();
  const seatId = useBooking((s) => s.selectedSeatId);
  const go = useBooking((s) => s.go);
  const confirm = useBooking((s) => s.confirmSimulatedBooking);
  const [busy, setBusy] = useState(false);

  if (!show) return null;
  const seat = show.seats.find((s) => s.id === seatId);
  if (!seat) {
    return (
      <section className="card narrow">
        <p>No seat selected.</p>
        <button className="primary" onClick={() => go('seats')}>
          Back to seat map
        </button>
      </section>
    );
  }

  const sec = show.config.sections[seat.section];
  const st = viewingStats(seat, show.config);
  const providers = getCinemaProviders(show.cinema);
  const when = new Date(show.date + 'T00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const submitSimulated = () => {
    setBusy(true);
    setTimeout(confirm, 500);
  };

  return (
    <section className="card checkout-card">
      <div className="checkout-head">
        <div>
          <span className="eyebrow-pill">SEAT PREVIEW COMPLETE · {show.cinema.city.toUpperCase()}</span>
          <h1 className="page-title">External Booking Handoff</h1>
        </div>
        <span className="verify-badge verified">{show.cinema.verificationTier}</span>
      </div>

      <HandoffNotice />

      <div className="checkout-grid">
        <div className="checkout-summary">
          <h3>Verified Preview Summary</h3>
          <dl className="receipt">
            <div>
              <dt>Movie</dt>
              <dd>
                <strong>{show.movie.title}</strong> ({show.movie.language} · {show.movie.rating})
              </dd>
            </div>
            <div>
              <dt>Cinema</dt>
              <dd>
                <strong>{show.cinema.name}</strong>
                <br />
                <small className="muted">{show.cinema.address}</small>
              </dd>
            </div>
            <div>
              <dt>Auditorium</dt>
              <dd>
                {show.config.name}
                <br />
                <small className="muted">
                  {show.config.verificationStatus === 'VERIFIED_LAYOUT'
                    ? 'Verified Layout'
                    : 'Estimated Prototype Layout'}
                </small>
              </dd>
            </div>
            <div>
              <dt>Showtime</dt>
              <dd>
                {when} · <strong>{show.time}</strong>
              </dd>
            </div>
            <div>
              <dt>Previewed Seat</dt>
              <dd>
                <strong className="accent-text">Seat {seat.id}</strong> · Row {seat.row} ({sec.label})
              </dd>
            </div>
            <div>
              <dt>Sightline Telemetry</dt>
              <dd>
                {st.distance.toFixed(1)} m distance · {describeAngle(st)} · {Math.round(st.coverageDeg)}° FOV
              </dd>
            </div>
            <div className="total">
              <dt>Estimated Ticket Price</dt>
              <dd>₹{sec.price}</dd>
            </div>
          </dl>
        </div>

        <div className="handoff-panel">
          <h3>Continue to Authorized Provider</h3>
          <p className="muted">
            Select an official ticketing partner below to book <strong>Seat {seat.id} ({sec.label})</strong> at{' '}
            <strong>{show.cinema.name}</strong> for the <strong>{show.time}</strong> show:
          </p>

          <div className="provider-cards">
            {providers.map((bp, idx) => (
              <a
                key={bp.id}
                href={idx === 0 ? show.cinema.externalBookingUrl : bp.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={'provider-handoff-btn' + (idx === 0 ? ' primary-provider' : '')}
              >
                <div>
                  <strong>Continue on {bp.name}</strong>
                  <small>
                    Official ticketing for {show.cinema.name}, {show.cinema.city}
                  </small>
                </div>
                <span className="handoff-arrow">↗</span>
              </a>
            ))}
          </div>

          <div className="prototype-sim-box">
            <span className="verify-badge demo">PROTOTYPE DEMO OPTION</span>
            <p className="muted">
              Testing the end-to-end FOVO prototype flow? You can also generate a simulated prototype booking pass without leaving the app:
            </p>
            <button
              type="button"
              className="ghost full-width"
              disabled={busy}
              onClick={submitSimulated}
            >
              {busy ? 'Generating simulated pass…' : 'Confirm Simulated Prototype Booking'}
            </button>
          </div>
        </div>
      </div>

      <div className="row-actions checkout-footer">
        <button className="ghost" onClick={() => go('preview')}>
          ← Return to 3D Seat Preview
        </button>
        <button className="ghost" onClick={() => go('seats')}>
          Change Seat on Map
        </button>
      </div>
    </section>
  );
}

export function Confirmation() {
  const show = useShow();
  const seatId = useBooking((s) => s.selectedSeatId);
  const ref = useBooking((s) => s.bookingRef);
  const reset = useBooking((s) => s.reset);
  if (!show) return null;
  const seat = show.seats.find((s) => s.id === seatId);
  const providers = getCinemaProviders(show.cinema);
  return (
    <section className="card narrow center">
      <p className="badge">SIMULATED PROTOTYPE PASS</p>
      <h1 className="page-title">Booking simulated</h1>
      <HandoffNotice />
      <p className="ref">{ref}</p>
      <p>
        <strong>{show.movie.title}</strong> ({show.movie.language})
      </p>
      <p>
        {show.cinema.name} · {show.cinema.city}
      </p>
      <p className="muted">
        {show.date} · {show.time} · Seat {seat?.id}
      </p>
      <div className="row-actions">
        {providers[0] && (
          <a
            href={show.cinema.externalBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="primary"
            style={{ textDecoration: 'none' }}
          >
            Book Real Tickets on {providers[0].name} ↗
          </a>
        )}
        <button className="ghost" onClick={reset}>
          Back to Hubballi Movies
        </button>
      </div>
    </section>
  );
}
