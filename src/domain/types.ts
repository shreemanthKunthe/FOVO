export type SectionId = 'prime' | 'classicPlus' | 'classic' | 'lounger';
export type Vec3 = [number, number, number];
/** Availability of a seat for a given showtime. "Selected" is derived from the booking store. */
export type SeatStatus = 'available' | 'occupied' | 'unavailable';

export interface SectionDef {
  id: SectionId;
  label: string;
  price: number;
  color: string;
  seatStyle: 'standard' | 'recliner' | 'lounger';
  /** Centre-to-centre spacing between seats in this section (m). */
  seatPitch: number;
  /** Seat cushion height above the row floor (m). */
  seatHeight: number;
  /** Eye height above the seat cushion (m). */
  eyeOffset: number;
}

export interface RowDef {
  /** Display label, e.g. "A". */
  label: string;
  section: SectionId;
  seatCount: number;
  /** Seat numbers after which an aisle gap is inserted. */
  aislesAfter?: number[];
  /** Seat numbers that physically do not exist. */
  missingSeats?: number[];
  /** Distance of the row from the screen plane (m). */
  z: number;
  /** Floor elevation of the row (m). */
  riser: number;
}

export interface AuditoriumConfig {
  id: string;
  name: string;
  dims: { width: number; length: number; height: number };
  /** Screen centred on x = 0, on the plane z = 0. */
  screen: { width: number; height: number; bottomY: number };
  aisleWidth: number;
  sections: Record<SectionId, SectionDef>;
  /** Ordered front (nearest screen) to back. */
  rows: RowDef[];
}

export interface Seat {
  id: string; // "A-12"
  row: string;
  number: number;
  section: SectionId;
  world: { position: Vec3; rotationY: number };
  eye: { position: Vec3; lookAt: Vec3 };
  map: { x: number; y: number };
}
