import type { AuditoriumConfig, RowDef, SectionDef, SectionId } from '../types';

/**
 * Auditoriums are generated from a small declarative spec. Change row counts,
 * seat counts, spacing, prices or aisles here; the seat map, the 3D room and
 * the camera poses all follow automatically.
 *
 * ASSUMPTION: all dimensions are configurable sample values, not measurements
 * of a real cinema.
 */
export interface BlockSpec {
  section: SectionId;
  rows: number;
  seats: number;
  /** Seat numbers after which a walkway is inserted. */
  aislesAfter?: number[];
}
export interface SectionSpec {
  price: number;
  /** Centre-to-centre seat spacing (m). */
  seatPitch: number;
  /** Row-to-row spacing (m). */
  rowPitch: number;
}
export interface AuditoriumSpec {
  id: string;
  name: string;
  screen: { width: number; height: number; bottomY: number };
  firstRowZ: number;
  /** Extra distance inserted between two different sections (m). */
  sectionGap: number;
  aisleWidth: number;
  sideAisle: number;
  /** Ordered front (nearest the screen) to back. */
  blocks: BlockSpec[];
  sections: Record<SectionId, SectionSpec>;
}

const SECTION_BASE: Record<SectionId, Omit<SectionDef, 'price' | 'seatPitch'>> = {
  prime: { id: 'prime', label: 'Prime', color: '#d4af6a', seatStyle: 'recliner', seatHeight: 0.45, eyeOffset: 0.75 },
  classicPlus: { id: 'classicPlus', label: 'Classic Plus', color: '#7aa7d9', seatStyle: 'standard', seatHeight: 0.45, eyeOffset: 0.75 },
  classic: { id: 'classic', label: 'Classic', color: '#86b79a', seatStyle: 'standard', seatHeight: 0.45, eyeOffset: 0.75 },
  lounger: { id: 'lounger', label: 'Lounger', color: '#c98aa5', seatStyle: 'lounger', seatHeight: 0.4, eyeOffset: 0.7 },
};

const HEAD = 0.12; // head top above eye level (m)
const TARGET_C = 0.07; // sightline clearance over the row in front (m)
const MIN_STEP = 0.15;

/** Smallest riser so the sightline to the screen bottom clears the row in front by TARGET_C. */
function requiredRiser(
  prev: RowDef,
  z: number,
  section: SectionDef,
  prevSection: SectionDef,
  screenBottom: number,
): number {
  const eyeOf = (s: SectionDef) => s.seatHeight + s.eyeOffset;
  const headFront = prev.riser + eyeOf(prevSection) + HEAD;
  const f = (z - prev.z) / z;
  const needed = (headFront + TARGET_C - screenBottom * f) / (1 - f) - eyeOf(section);
  return Math.max(needed, prev.riser + MIN_STEP);
}

export function createAuditorium(spec: AuditoriumSpec): AuditoriumConfig {
  const sections = Object.fromEntries(
    (Object.keys(SECTION_BASE) as SectionId[]).map((id) => [
      id,
      { ...SECTION_BASE[id], price: spec.sections[id].price, seatPitch: spec.sections[id].seatPitch },
    ]),
  ) as Record<SectionId, SectionDef>;

  const flat = spec.blocks.flatMap((b) =>
    Array.from({ length: b.rows }, () => ({ section: b.section, seats: b.seats, aisles: b.aislesAfter })),
  );
  const total = flat.length;
  const rows: RowDef[] = [];

  flat.forEach((r, i) => {
    const label = String.fromCharCode(65 + (total - 1 - i)); // back row = A
    let z = spec.firstRowZ;
    let riser = 0;
    if (i > 0) {
      const p = rows[i - 1];
      const pp = spec.sections[p.section].rowPitch;
      const cp = spec.sections[r.section].rowPitch;
      z = p.z + (p.section === r.section ? cp : (pp + cp) / 2 + spec.sectionGap);
      riser = requiredRiser(p, z, sections[r.section], sections[p.section], spec.screen.bottomY);
    }
    rows.push({ label, section: r.section, seatCount: r.seats, aislesAfter: r.aisles, z, riser });
  });

  const maxRowWidth = Math.max(
    ...spec.blocks.map(
      (b) => b.seats * spec.sections[b.section].seatPitch + (b.aislesAfter?.length ?? 0) * spec.aisleWidth,
    ),
  );
  const width = Math.max(12, Math.ceil(maxRowWidth + spec.sideAisle * 2));
  const last = rows[rows.length - 1];

  return {
    id: spec.id,
    name: spec.name,
    dims: { width, length: Math.ceil(last.z + 3), height: Math.ceil(last.riser + 5) },
    screen: spec.screen,
    aisleWidth: spec.aisleWidth,
    sections,
    rows,
  };
}

/**
 * Reference layout (from the supplied seat-map screenshot), 183 seats:
 *   Lounger      Rs290  1 row  x 12  (front, nearest the screen)
 *   Classic      Rs250  2 rows x 15
 *   Classic Plus Rs270  6 rows x 15
 *   Prime        Rs330  3 rows x 17  (back)
 * Rows are labelled from the back (A = last row).
 */
export const referenceSpec: AuditoriumSpec = {
  id: 'reference-183',
  name: 'Screen 1',
  screen: { width: 11, height: 4.6, bottomY: 1.6 },
  firstRowZ: 5.5,
  sectionGap: 0.5,
  aisleWidth: 0.9,
  sideAisle: 1.7,
  blocks: [
    { section: 'lounger', rows: 1, seats: 12 },
    { section: 'classic', rows: 2, seats: 15 },
    { section: 'classicPlus', rows: 6, seats: 15 },
    { section: 'prime', rows: 3, seats: 17 },
  ],
  sections: {
    lounger: { price: 290, seatPitch: 0.95, rowPitch: 1.6 },
    classic: { price: 250, seatPitch: 0.55, rowPitch: 1.05 },
    classicPlus: { price: 270, seatPitch: 0.58, rowPitch: 1.1 },
    prime: { price: 330, seatPitch: 0.62, rowPitch: 1.2 },
  },
};

/** A second, differently shaped auditorium with centre aisles (proves the layout is data-driven). */
export const grandSpec: AuditoriumSpec = {
  ...referenceSpec,
  id: 'grand-212',
  name: 'Audi 3',
  screen: { width: 12, height: 5, bottomY: 1.6 },
  blocks: [
    { section: 'lounger', rows: 1, seats: 12 },
    { section: 'classic', rows: 2, seats: 16, aislesAfter: [8] },
    { section: 'classicPlus', rows: 7, seats: 16, aislesAfter: [8] },
    { section: 'prime', rows: 3, seats: 18, aislesAfter: [9] },
  ],
  sections: {
    lounger: { price: 320, seatPitch: 0.95, rowPitch: 1.6 },
    classic: { price: 220, seatPitch: 0.55, rowPitch: 1.05 },
    classicPlus: { price: 260, seatPitch: 0.58, rowPitch: 1.1 },
    prime: { price: 360, seatPitch: 0.62, rowPitch: 1.2 },
  },
};

export const referenceAuditorium: AuditoriumConfig = createAuditorium(referenceSpec);
export const grandAuditorium: AuditoriumConfig = createAuditorium(grandSpec);
