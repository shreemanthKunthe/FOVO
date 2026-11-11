import { useCallback, useMemo } from 'react';
import type { Matrix4 } from 'three';
import type { AuditoriumConfig } from '../../../domain/types';
import { makeCarpetTexture, makeWallTexture } from './textures';
import { Instances, compose } from './Instances';

/** Walls, ceiling, sloped stepped floor, step lights and ambient lighting. */
export function Room({ config }: { config: AuditoriumConfig }) {
  const { width: W, length: L, height: H } = config.dims;
  const maxRiser = config.rows[config.rows.length - 1].riser;

  const wallTex = useMemo(() => {
    const t = makeWallTexture();
    t.repeat.set(L / 3, H / 3);
    return t;
  }, [L, H]);
  const carpet = useMemo(() => {
    const t = makeCarpetTexture();
    t.repeat.set(W / 2, L / 2);
    return t;
  }, [W, L]);

  // One stepped platform per row, running to the midpoint of its neighbours.
  const platforms = useMemo(
    () =>
      config.rows
        .map((r, i) => {
          const prev = config.rows[i - 1];
          const next = config.rows[i + 1];
          return {
            riser: r.riser,
            z0: prev ? (prev.z + r.z) / 2 : r.z - 1.2,
            z1: next ? (r.z + next.z) / 2 : L,
          };
        })
        .filter((p) => p.riser > 0.001),
    [config, L],
  );

  const fillStrips = useCallback(
    (i: number, m: Matrix4) => {
      const p = platforms[i >> 1];
      const side = i & 1 ? 1 : -1;
      compose(m, [side * (W / 2 - 0.9), p.riser - 0.05, p.z0 - 0.012], [1.4, 0.05, 0.02]);
    },
    [platforms, W],
  );
  const fillSconces = useCallback(
    (i: number, m: Matrix4) => {
      const r = config.rows[i >> 1];
      const side = i & 1 ? 1 : -1;
      compose(m, [side * (W / 2 - 0.05), r.riser + 1.6, r.z], [0.06, 0.32, 0.22]);
    },
    [config, W],
  );
  const stripCount = Math.floor((L - 2) / 3);
  const fillCeiling = useCallback(
    (i: number, m: Matrix4) => {
      const side = i & 1 ? 1 : -1;
      compose(m, [side * (W / 4), H - 0.04, 2 + (i >> 1) * 3], [0.18, 0.04, 1.6]);
    },
    [W, H],
  );

  return (
    <group>
      <hemisphereLight args={['#2a2f3a', '#0a0a0a', 0.7]} />
      <pointLight position={[0, H - 1, L / 2]} intensity={14} color="#ffd9a0" decay={2} />
      <pointLight position={[0, maxRiser + 3, L - 2]} intensity={8} color="#ffd9a0" decay={2} />

      {/* floor base + risers */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, L / 2]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial map={carpet} roughness={1} />
      </mesh>
      {platforms.map((p, i) => (
        <mesh key={i} position={[0, p.riser / 2, (p.z0 + p.z1) / 2]}>
          <boxGeometry args={[W, p.riser, p.z1 - p.z0]} />
          <meshStandardMaterial map={carpet} roughness={1} />
        </mesh>
      ))}
      <Instances count={platforms.length * 2} fill={fillStrips}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#8a6d3b" />
      </Instances>

      {/* walls */}
      <mesh position={[-W / 2, H / 2, L / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[L + 0.5, H]} />
        <meshStandardMaterial map={wallTex} roughness={1} />
      </mesh>
      <mesh position={[W / 2, H / 2, L / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[L + 0.5, H]} />
        <meshStandardMaterial map={wallTex} roughness={1} />
      </mesh>
      <mesh position={[0, H / 2, -0.2]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#0b0b0e" roughness={1} />
      </mesh>
      <mesh position={[0, H / 2, L]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#111114" roughness={1} />
      </mesh>
      {/* projection booth windows */}
      {[-2.5, 0, 2.5].map((x) => (
        <mesh key={x} position={[x, H - 1.1, L - 0.02]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.4, 0.55]} />
          <meshBasicMaterial color="#10161d" />
        </mesh>
      ))}
      {/* ceiling */}
      <mesh position={[0, H, L / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial color="#0c0c0f" roughness={1} />
      </mesh>
      <Instances count={Math.max(0, stripCount) * 2} fill={fillCeiling}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#2b2b33" />
      </Instances>
      {/* wall sconces follow the sloped floor */}
      <Instances count={config.rows.length * 2} fill={fillSconces}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#6f5a33" />
      </Instances>
    </group>
  );
}

