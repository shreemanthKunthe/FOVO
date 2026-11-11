import type { Seat, SeatStatus } from '../domain/types';

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Deterministic mock availability per showtime (stable between renders).
 * Replace with a real inventory API later; the rest of the app only reads
 * a Record<seatId, SeatStatus>.
 */
export function mockAvailability(seats: Seat[], showKey: string): Record<string, SeatStatus> {
  const out: Record<string, SeatStatus> = {};
  for (const s of seats) {
    const r = hashString(`${showKey}:${s.id}`) % 100;
    out[s.id] = r < 4 ? 'unavailable' : r < 38 ? 'occupied' : 'available';
  }
  return out;
}
