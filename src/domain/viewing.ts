import type { AuditoriumConfig, Seat, Vec3 } from './types';

const MAX_PITCH_UP = 0.35;
const MAX_PITCH_DOWN = -0.4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const deg = (r: number) => (r * 180) / Math.PI;

export function screenCentre(c: AuditoriumConfig): Vec3 {
  return [0, c.screen.bottomY + c.screen.height / 2, 0];
}

/** Camera pose for a seated viewer who turns head and eyes toward the screen centre. */
export function computeCameraPose(seat: Seat): { position: Vec3; yaw: number; pitch: number } {
  const [ex, ey, ez] = seat.eye.position;
  const [lx, ly, lz] = seat.eye.lookAt;
  const dx = lx - ex;
  const dy = ly - ey;
  const dz = lz - ez;
  // Camera looks down -Z at yaw 0; positive yaw turns toward -X (left).
  const yaw = Math.atan2(-dx, -dz);
  const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), MAX_PITCH_DOWN, MAX_PITCH_UP);
  return { position: [ex, ey, ez], yaw, pitch };
}

export interface ViewingStats {
  /** Eye to screen centre (m). */
  distance: number;
  /** Horizontal angle between the seat and the screen's centre line. */
  offAxisDeg: number;
  side: 'centre' | 'left' | 'right';
  /** Horizontal angle the screen occupies in the viewer's field of view. */
  coverageDeg: number;
  verdict: string;
}

/**
 * Guide values only. The verdict thresholds follow commonly cited cinema-viewing
 * guidance (roughly 30-40 degrees of screen coverage is considered comfortable)
 * and apply to the sample auditorium dimensions, not a real venue.
 */
export function viewingStats(seat: Seat, config: AuditoriumConfig): ViewingStats {
  const [ex, ey, ez] = seat.eye.position;
  const [cx, cy] = screenCentre(config);
  const half = config.screen.width / 2;
  const distance = Math.hypot(ex - cx, ey - cy, ez);
  const offAxisDeg = deg(Math.atan2(Math.abs(ex), ez));
  const coverageDeg = deg(Math.atan2(half - ex, ez) - Math.atan2(-half - ex, ez));
  const side = Math.abs(ex) < 0.4 ? 'centre' : ex < 0 ? 'left' : 'right';
  let verdict: string;
  if (coverageDeg >= 70) verdict = 'Very close. You will turn your head to follow the action.';
  else if (coverageDeg >= 50) verdict = 'Immersive. The screen fills most of your view.';
  else if (coverageDeg >= 32) verdict = 'Balanced. A comfortable full-screen view.';
  else verdict = 'Distant. The screen takes up less of your view.';
  return { distance, offAxisDeg, side, coverageDeg, verdict };
}

export function describeAngle(s: ViewingStats): string {
  return s.side === 'centre' ? 'Centred' : `${Math.round(s.offAxisDeg)}° ${s.side} of centre`;
}

