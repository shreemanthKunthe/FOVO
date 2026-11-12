import type { AuditoriumConfig, Seat, Vec3 } from '../types';
import { createMapTransform } from '../coords';

export interface GeometryValidationResult {
  valid: boolean;
  errors: string[];
  seatCount: number;
  rowCount: number;
}

/**
 * Validates that an AuditoriumConfig has sufficient physical 3D geometry
 * (screen dimensions, room dimensions, rows, and seat pitch) to construct
 * an accurate FOVO first-person viewing experience.
 */
export function validateAuditoriumGeometry(
  config: AuditoriumConfig | null | undefined,
): GeometryValidationResult {
  const errors: string[] = [];
  if (!config) {
    return { valid: false, errors: ['No auditorium configuration provided.'], seatCount: 0, rowCount: 0 };
  }
  if (!config.screen || !(config.screen.width > 1) || !(config.screen.height > 0.8)) {
    errors.push('Invalid or missing screen physical dimensions (width/height in metres).');
  }
  if (!config.dims || !(config.dims.width > 2) || !(config.dims.length > 2) || !(config.dims.height > 2)) {
    errors.push('Invalid or missing auditorium room dimensions.');
  }
  if (!Array.isArray(config.rows) || config.rows.length === 0) {
    errors.push('Auditorium has no seating rows defined.');
  }
  let totalSeats = 0;
  for (const row of config.rows ?? []) {
    const sec = config.sections?.[row.section];
    if (!sec || !(sec.seatPitch > 0.2)) {
      errors.push(`Row ${row.label} references an invalid section or seatPitch.`);
      continue;
    }
    if (!(row.z > 0.5)) {
      errors.push(`Row ${row.label} has invalid distance from screen (z = ${row.z}).`);
    }
    const missingCount = row.missingSeats?.length ?? 0;
    const activeInRow = Math.max(0, row.seatCount - missingCount);
    totalSeats += activeInRow;
  }
  if (totalSeats === 0) {
    errors.push('Auditorium contains zero valid seats.');
  }
  return {
    valid: errors.length === 0,
    errors,
    seatCount: totalSeats,
    rowCount: config.rows?.length ?? 0,
  };
}

/**
 * Pure function: config -> seats. This is the single source of truth for the
 * 2D map, the 3D scene and the camera poses.
 *
 * World space (metres): origin = screen base centre on the floor,
 * +X = audience right, +Y = up, +Z = towards the audience.
 *
 * Supports rectangular, curved, IMAX, and irregular (missingSeats / multi-aisle)
 * auditorium geometries.
 */
export function generateSeats(config: AuditoriumConfig): Seat[] {
  const screenCentre: Vec3 = [0, config.screen.bottomY + config.screen.height / 2, 0];
  const raw: Omit<Seat, 'map'>[] = [];

  const defaultCurveRadius =
    config.archShape === 'imax' ? 26 : config.archShape === 'curved' ? 32 : 0;

  for (const row of config.rows) {
    const sec = config.sections[row.section];
    if (!sec) continue;
    const aisles = row.aislesAfter ?? [];
    const missing = new Set(row.missingSeats ?? []);

    // x offsets with aisle gaps, then centre the row on x = 0.
    const xs: number[] = [];
    let x = 0;
    for (let n = 1; n <= row.seatCount; n++) {
      xs.push(x);
      x += sec.seatPitch + (aisles.includes(n) ? config.aisleWidth : 0);
    }
    if (xs.length === 0) continue;
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    const curveR = row.curveRadius ?? defaultCurveRadius;

    for (let n = 1; n <= row.seatCount; n++) {
      if (missing.has(n)) continue;
      const sx = xs[n - 1] - mid;
      // For curved / IMAX rows, bring outer seats slightly closer along the circular arc
      // and angle the chair yaw inward toward the screen centre.
      let sz = row.z;
      let rotationY = 0;
      if (curveR > 0 && Math.abs(sx) < curveR * 0.9) {
        const sagitta = curveR - Math.sqrt(curveR * curveR - sx * sx);
        sz = Math.max(1.8, row.z - sagitta);
        rotationY = Math.atan2(-sx, sz) * 0.65;
      }
      const sy = row.riser + sec.seatHeight;
      raw.push({
        id: `${row.label}-${n}`,
        row: row.label,
        number: n,
        section: row.section,
        world: { position: [sx, row.riser, sz], rotationY },
        eye: { position: [sx, sy + sec.eyeOffset, sz - 0.1], lookAt: screenCentre },
      });
    }
  }

  if (raw.length === 0) {
    return [];
  }

  const t = createMapTransform(raw.map((s) => ({ x: s.world.position[0], z: s.world.position[2] })));
  return raw.map((s) => ({ ...s, map: t.worldToMap(s.world.position[0], s.world.position[2]) }));
}

const cache = new WeakMap<AuditoriumConfig, Seat[]>();
/** Memoised per config object so every consumer shares identical seat data. */
export function getSeats(config: AuditoriumConfig): Seat[] {
  let s = cache.get(config);
  if (!s) {
    s = generateSeats(config);
    cache.set(config, s);
  }
  return s;
}
