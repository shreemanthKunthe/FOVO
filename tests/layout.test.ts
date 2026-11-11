import { describe, it, expect } from 'vitest';
import { referenceAuditorium as cfg, grandAuditorium } from '../src/domain/layout/presets';
import { generateSeats } from '../src/domain/layout/generateSeats';
import { createMapTransform } from '../src/domain/coords';
import { computeCameraPose, viewingStats } from '../src/domain/viewing';
import { neighbourSeat } from '../src/domain/navigation';
import { mockAvailability } from '../src/data/mockAvailability';

const seats = generateSeats(cfg);
const byId = (id: string) => seats.find((s) => s.id === id)!;

describe('reference auditorium', () => {
  it('has 183 seats with the expected section counts', () => {
    expect(seats).toHaveLength(183);
    const count = (s: string) => seats.filter((x) => x.section === s).length;
    expect(count('prime')).toBe(51);
    expect(count('classicPlus')).toBe(90);
    expect(count('classic')).toBe(30);
    expect(count('lounger')).toBe(12);
  });

  it('has unique ids and unique map/world positions', () => {
    expect(new Set(seats.map((s) => s.id)).size).toBe(seats.length);
    const keys = new Set(seats.map((s) => s.map.x.toFixed(3) + ',' + s.map.y.toFixed(3)));
    expect(keys.size).toBe(seats.length);
  });

  it('seat 1 is on the audience left (negative x)', () => {
    expect(byId('A-1').world.position[0]).toBeLessThan(byId('A-17').world.position[0]);
  });

  it('map <-> world round-trips', () => {
    const pts = seats.map((s) => ({ x: s.world.position[0], z: s.world.position[2] }));
    const t = createMapTransform(pts);
    for (const s of seats) {
      const m = t.worldToMap(s.world.position[0], s.world.position[2]);
      const w = t.mapToWorld(m.x, m.y);
      expect(Math.abs(w.x - s.world.position[0])).toBeLessThan(1e-6);
      expect(Math.abs(w.z - s.world.position[2])).toBeLessThan(1e-6);
    }
  });

  it('rows get farther from the screen and higher toward the back', () => {
    for (let i = 1; i < cfg.rows.length; i++) {
      expect(cfg.rows[i].z).toBeGreaterThan(cfg.rows[i - 1].z);
      expect(cfg.rows[i].riser).toBeGreaterThan(cfg.rows[i - 1].riser);
    }
  });

  it('the room is large enough for every seat and eye position', () => {
    for (const s of seats) {
      expect(Math.abs(s.eye.position[0])).toBeLessThan(cfg.dims.width / 2);
      expect(s.eye.position[2]).toBeLessThan(cfg.dims.length);
      expect(s.eye.position[1]).toBeLessThan(cfg.dims.height - 1);
    }
  });
});

describe.each([cfg, grandAuditorium])('sightlines: $id', (c) => {
  it('every row has an unobstructed sightline to the screen bottom (C-value)', () => {
    const HEAD = 0.12;
    const MIN_CLEARANCE = 0.06;
    for (let i = 1; i < c.rows.length; i++) {
      const front = c.rows[i - 1];
      const back = c.rows[i];
      const fs = c.sections[front.section];
      const bs = c.sections[back.section];
      const eyeBack = back.riser + bs.seatHeight + bs.eyeOffset;
      const headFront = front.riser + fs.seatHeight + fs.eyeOffset + HEAD;
      const frac = (back.z - front.z) / back.z;
      const rayY = eyeBack + (c.screen.bottomY - eyeBack) * frac;
      expect(rayY - headFront, `row ${back.label}`).toBeGreaterThanOrEqual(MIN_CLEARANCE);
    }
  });
});

describe('second auditorium is data driven', () => {
  it('has centre aisles and a different seat count', () => {
    const g = generateSeats(grandAuditorium);
    expect(g.length).toBe(12 + 2 * 16 + 7 * 16 + 3 * 18);
    // Prime rows have an aisle after seat 9.
    const a9 = g.find((s) => s.id === 'A-9')!;
    const a10 = g.find((s) => s.id === 'A-10')!;
    const pitch = grandAuditorium.sections.prime.seatPitch;
    expect(a10.world.position[0] - a9.world.position[0]).toBeCloseTo(pitch + grandAuditorium.aisleWidth, 6);
  });
});

describe('first-person camera', () => {
  it('is at seated eye height above the row floor', () => {
    const s = byId('F-8');
    const row = cfg.rows.find((r) => r.label === 'F')!;
    const sec = cfg.sections[s.section];
    expect(s.eye.position[1]).toBeCloseTo(row.riser + sec.seatHeight + sec.eyeOffset, 6);
  });

  it('turns toward the screen from side seats', () => {
    // Row C is a 17-seat Prime row; seat 9 is the centre.
    expect(computeCameraPose(byId('C-1')).yaw).toBeLessThan(0); // left seat turns right
    expect(computeCameraPose(byId('C-17')).yaw).toBeGreaterThan(0); // right seat turns left
    expect(Math.abs(computeCameraPose(byId('C-9')).yaw)).toBeLessThan(0.02);
  });

  it('front rows fill more of the view than back rows', () => {
    const front = viewingStats(byId('L-6'), cfg);
    const back = viewingStats(byId('A-9'), cfg);
    expect(front.coverageDeg).toBeGreaterThan(back.coverageDeg);
    expect(front.distance).toBeLessThan(back.distance);
  });

  it('side seats have a larger off-axis angle than centre seats', () => {
    expect(viewingStats(byId('C-1'), cfg).offAxisDeg).toBeGreaterThan(viewingStats(byId('C-9'), cfg).offAxisDeg + 5);
  });
});

describe('seat navigation', () => {
  const av = mockAvailability(seats, 'test');
  it('never returns an unavailable seat and moves in the right direction', () => {
    const cur = seats.find((s) => av[s.id] === 'available' && s.row === 'F')!;
    for (const dir of ['left', 'right', 'front', 'back'] as const) {
      const n = neighbourSeat(seats, av, cur, dir);
      if (!n) continue;
      expect(av[n.id]).toBe('available');
      if (dir === 'left') expect(n.world.position[0]).toBeLessThan(cur.world.position[0]);
      if (dir === 'right') expect(n.world.position[0]).toBeGreaterThan(cur.world.position[0]);
      if (dir === 'front') expect(n.world.position[2]).toBeLessThan(cur.world.position[2]);
      if (dir === 'back') expect(n.world.position[2]).toBeGreaterThan(cur.world.position[2]);
    }
  });
});
