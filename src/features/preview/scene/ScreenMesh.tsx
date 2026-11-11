import { useFrame } from '@react-three/fiber';
import type { AuditoriumConfig } from '../../../domain/types';
import { trailer, useTrailer } from '../../trailer/TrailerController';

/**
 * The projection screen. The trailer is a texture on this mesh; nothing is
 * overlaid in HTML. Content is letterboxed to its own aspect ratio.
 */
export function ScreenMesh({ config }: { config: AuditoriumConfig }) {
  const version = useTrailer((s) => s.version);
  const aspect = useTrailer((s) => s.aspect);
  const { width: sw, height: sh, bottomY } = config.screen;
  const cy = bottomY + sh / 2;
  const wide = aspect > sw / sh;
  const fw = wide ? sw : sh * aspect;
  const fh = wide ? sw / aspect : sh;

  useFrame((_, dt) => trailer.tick(Math.min(dt, 0.1)));

  const tex = trailer.texture;
  return (
    <group>
      <mesh position={[0, cy, -0.06]}>
        <planeGeometry args={[sw + 0.5, sh + 0.5]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      <mesh position={[0, cy, -0.02]}>
        <planeGeometry args={[sw, sh]} />
        <meshBasicMaterial color="#050505" />
      </mesh>
      {tex && (
        <mesh key={version} position={[0, cy, 0]}>
          <planeGeometry args={[fw, fh]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
      {/* soft spill from the screen onto the first rows */}
      <pointLight position={[0, cy, 3]} intensity={26} color="#cfd8ff" decay={2} />
    </group>
  );
}

