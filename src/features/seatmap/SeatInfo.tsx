import type { Seat, AuditoriumConfig } from '../../domain/types';
import { describeAngle, viewingStats } from '../../domain/viewing';

export function Legend() {
  return (
    <ul className="legend" aria-label="Seat legend">
      <li><i className="sw sw-available" />Available</li>
      <li><i className="sw sw-occupied" />Occupied</li>
      <li><i className="sw sw-selected" />Selected</li>
      <li><i className="sw sw-unavailable" />Unavailable</li>
    </ul>
  );
}

/** Seat number, section, price and the few numbers that matter for a decision. */
export function SeatCard({ seat, config }: { seat: Seat; config: AuditoriumConfig }) {
  const sec = config.sections[seat.section];
  const st = viewingStats(seat, config);
  return (
    <div className="seatcard">
      <div className="seatcard-head">
        <h3>Seat {seat.id}</h3>
        <span className="price">₹{sec.price}</span>
      </div>
      <p className="muted">Row {seat.row} · {sec.label}</p>
      <dl className="stats">
        <div><dt>Distance to screen</dt><dd>{st.distance.toFixed(1)} m</dd></div>
        <div><dt>Viewing angle</dt><dd>{describeAngle(st)}</dd></div>
        <div><dt>Screen fills</dt><dd>{Math.round(st.coverageDeg)}° of view</dd></div>
      </dl>
      <p className="verdict">{st.verdict}</p>
    </div>
  );
}

