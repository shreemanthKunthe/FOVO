export interface MapTransform {
  worldToMap(x: number, z: number): { x: number; y: number };
  mapToWorld(mx: number, my: number): { x: number; z: number };
  width: number;
  height: number;
  /** Map y of the screen plane (z = 0), for drawing the screen. */
  screenY: number;
  scale: number;
}

/**
 * Top-down projection, screen at the BOTTOM of the map (matches the
 * reference design): map.y grows as z shrinks.
 *   mx = (x - minX) * S + pad
 *   my = (maxZ - z) * S + pad
 */
export function createMapTransform(
  points: { x: number; z: number }[],
  scale = 36,
  pad = 40,
  screenGap = 70,
): MapTransform {
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const maxZ = Math.max(...points.map((p) => p.z));
  const worldToMap = (x: number, z: number) => ({
    x: (x - minX) * scale + pad,
    y: (maxZ - z) * scale + pad,
  });
  const mapToWorld = (mx: number, my: number) => ({
    x: (mx - pad) / scale + minX,
    z: maxZ - (my - pad) / scale,
  });
  return {
    worldToMap,
    mapToWorld,
    width: (maxX - minX) * scale + pad * 2,
    height: (maxZ - minZ) * scale + pad * 2 + screenGap,
    screenY: (maxZ - minZ) * scale + pad + screenGap,
    scale,
  };
}

