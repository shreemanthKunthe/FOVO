import type { AuditoriumConfig, Seat, Vec3 } from '../types';
import { createMapTransform } from '../coords';

/**
 * Pure function: config -> seats. This is the single source of truth for the
 * 2D map, the 3D scene and the camera poses.
 *
 * World space (metres): origin = screen base centre on the floor,
 * +X = audience right, +Y = up, +Z = towards the audience.
 */
export function generateSeats(config: AuditoriumConfig): Seat[] {
  const screenCentre: Vec3 = [0, config.screen.bottomY + config.screen.height / 2, 0];
  const raw: Omit<Seat, 'map'>[] = [];

  for (const row of config.rows) {
    const sec = config.sections[row.section];
    const aisles = row.aislesAfter ?? [];
    const missing = new Set(row.missingSeats ?? []);

    // x offsets with aisle gaps, then centre the row on x = 0.
    const xs: number[] = [];
    let x = 0;
    for (let n = 1; n <= row.seatCount; n++) {
      xs.push(x);
      x += sec.seatPitch + (aisles.includes(n) ? config.aisleWidth : 0);
    }
    const mid = (xs[0] + xs[xs.length - 1]) / 2;

    for (let n = 1; n <= row.seatCount; n++) {
      if (missing.has(n)) continue;
      const sx = xs[n - 1] - mid;
      const sy = row.riser + sec.seatHeight;
      raw.push({
        id: `${row.label}-${n}`,
        row: row.label,
        number: n,
        section: row.section,
        world: { position: [sx, row.riser, row.z], rotationY: 0 },
        eye: { position: [sx, sy + sec.eyeOffset, row.z - 0.1], lookAt: screenCentre },
      });
    }
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
