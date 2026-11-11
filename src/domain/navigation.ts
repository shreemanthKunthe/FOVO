import type { Seat, SeatStatus } from './types';

export type Direction = 'left' | 'right' | 'front' | 'back';

/**
 * Nearest available seat in a direction, used for quick seat switching.
 * left/right stay in the row; front/back move to the closest row that has an
 * available seat and pick the seat with the nearest x position.
 */
export function neighbourSeat(
  seats: Seat[],
  availability: Record<string, SeatStatus>,
  current: Seat,
  dir: Direction,
): Seat | null {
  const ok = (s: Seat) => s.id !== current.id && availability[s.id] === 'available';
  const cx = current.world.position[0];
  const cz = current.world.position[2];

  if (dir === 'left' || dir === 'right') {
    const sign = dir === 'left' ? -1 : 1;
    const cands = seats
      .filter((s) => s.row === current.row && ok(s) && (s.world.position[0] - cx) * sign > 1e-6)
      .sort((a, b) => Math.abs(a.world.position[0] - cx) - Math.abs(b.world.position[0] - cx));
    return cands[0] ?? null;
  }

  const sign = dir === 'front' ? -1 : 1;
  const rowZs = [...new Set(seats.map((s) => s.world.position[2]))]
    .filter((z) => (z - cz) * sign > 1e-6)
    .sort((a, b) => Math.abs(a - cz) - Math.abs(b - cz));
  for (const z of rowZs) {
    const cands = seats
      .filter((s) => s.world.position[2] === z && ok(s))
      .sort((a, b) => Math.abs(a.world.position[0] - cx) - Math.abs(b.world.position[0] - cx));
    if (cands[0]) return cands[0];
  }
  return null;
}

