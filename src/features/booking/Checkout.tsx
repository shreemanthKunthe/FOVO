import { useState } from 'react';
import { useBooking } from '../../store/bookingStore';
import { useShow } from '../../store/useShow';

function Notice() {
  return (
    <p className="notice" role="note">
      Prototype: this is a simulated booking. No seat is reserved and no payment is taken.
    </p>
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
        <button className="primary" onClick={() => go('seats')}>Back to seat map</button>
      </section>
    );
  }
  const sec = show.config.sections[seat.section];
  const when = new Date(show.date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const submit = () => {
    setBusy(true);
    setTimeout(confirm, 700); // simulated latency
  };

  return (
    <section className="card narrow">
      <h1 className="page-title">Review your booking</h1>
      <Notice />
      <dl className="receipt">
        <div><dt>Movie</dt><dd>{show.movie.title}</dd></div>
        <div><dt>Cinema</dt><dd>{show.cinema.name}, {show.cinema.area}</dd></div>
        <div><dt>Show</dt><dd>{when} · {show.time}</dd></div>
        <div><dt>Seat</dt><dd>{seat.id} (Row {seat.row})</dd></div>
        <div><dt>Category</dt><dd>{sec.label}</dd></div>
        <div><dt>Ticket price</dt><dd>₹{sec.price}</dd></div>
        <div className="total"><dt>Total</dt><dd>₹{sec.price}</dd></div>
      </dl>
      <div className="row-actions">
        <button className="ghost" onClick={() => go('preview')}>Back to preview</button>
        <button className="ghost" onClick={() => go('seats')}>Change seat</button>
        <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Simulating…' : 'Confirm simulated booking'}</button>
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
  return (
    <section className="card narrow center">
      <p className="badge">SIMULATED BOOKING</p>
      <h1 className="page-title">Booking simulated</h1>
      <Notice />
      <p className="ref">{ref}</p>
      <p>{show.movie.title} · {show.cinema.name}</p>
      <p className="muted">{show.date} · {show.time} · Seat {seat?.id}</p>
      <button className="primary" onClick={reset}>Back to movies</button>
    </section>
  );
}

