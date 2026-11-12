import type {
  AuditoriumArchShape,
  AuditoriumConfig,
  AuditoriumVerificationStatus,
  LayoutSourceType,
  RowDef,
  SectionDef,
  SectionId,
} from '../types';

/**
 * Auditoriums are generated from a small declarative spec. Change row counts,
 * seat counts, spacing, prices or aisles here; the seat map, the 3D room and
 * the camera poses all follow automatically.
 *
 * ASSUMPTION: all dimensions are configurable sample values unless explicitly
 * imported from a verified physical survey.
 */
export interface BlockSpec {
  section: SectionId;
  rows: number;
  seats: number;
  /** Seat numbers after which a walkway is inserted. */
  aislesAfter?: number[];
  /** Optional missing seat numbers in this block. */
  missingSeats?: number[];
  /** Optional horizontal radius of curvature (m) for curved / IMAX rows. */
  curveRadius?: number;
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
  cinemaId?: string;
  screenNumber?: number;
  country?: string;
  city?: string;
  archShape?: AuditoriumArchShape;
  layoutSource?: LayoutSourceType;
  lastVerifiedAt?: string;
  verificationStatus?: AuditoriumVerificationStatus;
  verificationNotes?: string;
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
    Array.from({ length: b.rows }, () => ({
      section: b.section,
      seats: b.seats,
      aisles: b.aislesAfter,
      missingSeats: b.missingSeats,
      curveRadius: b.curveRadius,
    })),
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
    rows.push({
      label,
      section: r.section,
      seatCount: r.seats,
      aislesAfter: r.aisles,
      missingSeats: r.missingSeats,
      curveRadius: r.curveRadius,
      z,
      riser,
    });
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
    cinemaId: spec.cinemaId,
    screenNumber: spec.screenNumber ?? 1,
    country: spec.country ?? 'India',
    city: spec.city,
    archShape: spec.archShape ?? 'rectangular',
    layoutSource: spec.layoutSource ?? 'CALIBRATED_TEMPLATE',
    lastVerifiedAt: spec.lastVerifiedAt ?? '2026-11-12',
    verificationStatus: spec.verificationStatus ?? 'ESTIMATED_PROTOTYPE_LAYOUT',
    verificationNotes:
      spec.verificationNotes ??
      'Estimated configurable auditorium layout for seat-perspective preview. Exact physical seat counts and room dimensions require a venue floorplan.',
    dims: {
      width: Math.max(width, Math.ceil(spec.screen.width + 2)),
      length: Math.ceil(last.z + 3),
      height: Math.max(Math.ceil(last.riser + 5), Math.ceil(spec.screen.bottomY + spec.screen.height + 1.5)),
    },
    screen: spec.screen,
    aisleWidth: spec.aisleWidth,
    sections,
    rows,
  };
}

/**
 * Primary Pilot — Cinépolis, Urban Oasis Mall, Hubballi (Audi 1 estimated configuration)
 * Based on the 4-tier reference seating architecture (183 seats):
 *   Lounger      Rs290  1 row  x 12  (front, nearest the screen)
 *   Classic      Rs250  2 rows x 15
 *   Classic Plus Rs270  6 rows x 15
 *   Prime        Rs330  3 rows x 17  (back)
 * Rows are labelled from the back (A = last row).
 */
export const referenceSpec: AuditoriumSpec = {
  id: 'reference-183',
  name: 'Cinépolis Audi 1 (Estimated Layout)',
  cinemaId: 'cinepolis-urban-oasis-hbl',
  verificationStatus: 'ESTIMATED_PROTOTYPE_LAYOUT',
  verificationNotes:
    'Cinépolis Urban Oasis Mall is verified as a 5-screen multiplex in Hubballi. This 183-seat 4-tier layout (Prime, Classic Plus, Classic, Lounger) is an estimated prototype configuration modelled from our reference seat map.',
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
  name: 'Multiplex Audi 2 (Estimated Center-Aisle Layout)',
  cinemaId: 'pvr-laxmi-mall-hbl',
  verificationStatus: 'ESTIMATED_PROTOTYPE_LAYOUT',
  verificationNotes:
    'Estimated 212-seat stadium auditorium with a centre aisle. Used to preview off-axis and centre-aisle perspectives when official CAD floorplans are not yet supplied.',
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

/**
 * Curved IMAX / PLF Auditorium (286 seats, steep stadium rake, curved seating rows, 19m × 9.6m tall screen)
 */
export const imaxCurvedSpec: AuditoriumSpec = {
  id: 'imax-curved-286',
  name: 'IMAX Laser Auditorium (Curved Stadium Layout)',
  screenNumber: 1,
  archShape: 'imax',
  layoutSource: 'CALIBRATED_TEMPLATE',
  verificationStatus: 'ESTIMATED_PROTOTYPE_LAYOUT',
  verificationNotes:
    'Curved large-format IMAX stadium configuration (19.0m × 9.6m screen, 26m row curvature radius, inward-angled seats). Labelled as an estimated prototype layout until venue CAD measurements are imported.',
  screen: { width: 19, height: 9.6, bottomY: 1.1 },
  firstRowZ: 6.2,
  sectionGap: 0.55,
  aisleWidth: 1.0,
  sideAisle: 1.8,
  blocks: [
    { section: 'classic', rows: 3, seats: 20, aislesAfter: [4, 16], curveRadius: 24 },
    { section: 'classicPlus', rows: 6, seats: 22, aislesAfter: [5, 17], curveRadius: 26 },
    { section: 'prime', rows: 4, seats: 24, aislesAfter: [6, 18], curveRadius: 28 },
  ],
  sections: {
    lounger: { price: 420, seatPitch: 0.95, rowPitch: 1.55 },
    classic: { price: 380, seatPitch: 0.6, rowPitch: 1.1 },
    classicPlus: { price: 460, seatPitch: 0.62, rowPitch: 1.16 },
    prime: { price: 580, seatPitch: 0.68, rowPitch: 1.28 },
  },
};

/**
 * Boutique Luxury Recliner Lounge Auditorium (64 seats, wide twin-recliner pairs)
 */
export const boutiqueReclinerSpec: AuditoriumSpec = {
  id: 'boutique-recliner-64',
  name: 'Insignia / Luxe Recliner Suite (Estimated Layout)',
  screenNumber: 3,
  archShape: 'recliner_lounge',
  layoutSource: 'CALIBRATED_TEMPLATE',
  verificationStatus: 'ESTIMATED_PROTOTYPE_LAYOUT',
  verificationNotes:
    'Luxury 64-seat all-recliner boutique auditorium with wide 1.05m seat pitch and twin-pod aisles. Labelled as an estimated prototype layout.',
  screen: { width: 9.2, height: 4.1, bottomY: 1.4 },
  firstRowZ: 4.8,
  sectionGap: 0.6,
  aisleWidth: 0.85,
  sideAisle: 1.4,
  blocks: [
    { section: 'lounger', rows: 2, seats: 10, aislesAfter: [2, 8] },
    { section: 'prime', rows: 4, seats: 11, aislesAfter: [2, 9] },
  ],
  sections: {
    lounger: { price: 520, seatPitch: 1.0, rowPitch: 1.75 },
    classic: { price: 420, seatPitch: 0.85, rowPitch: 1.5 },
    classicPlus: { price: 480, seatPitch: 0.92, rowPitch: 1.6 },
    prime: { price: 640, seatPitch: 1.05, rowPitch: 1.85 },
  },
};

export const imaxCurvedAuditorium: AuditoriumConfig = createAuditorium(imaxCurvedSpec);
export const boutiqueReclinerAuditorium: AuditoriumConfig = createAuditorium(boutiqueReclinerSpec);

export const AUDITORIUM_TEMPLATES: Record<string, AuditoriumConfig> = {
  [referenceAuditorium.id]: referenceAuditorium,
  [grandAuditorium.id]: grandAuditorium,
  [imaxCurvedAuditorium.id]: imaxCurvedAuditorium,
  [boutiqueReclinerAuditorium.id]: boutiqueReclinerAuditorium,
};
