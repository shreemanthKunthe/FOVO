import { useFrame } from '@react-three/fiber';
import type { Matrix4, PerspectiveCamera } from 'three';
import type { AuditoriumConfig } from '../../../domain/types';
import { trailer, useTrailer } from '../../trailer/TrailerController';

const eps = (n: number) => (Math.abs(n) < 1e-10 ? 0 : n);

/**
 * Converts Three.js `camera.matrixWorldInverse` into the exact CSS3D view matrix
 * `M_css = diag(1, -1, 1, 1) * V * diag(1, -1, 1, 1)` so a DOM plane placed at
 * CSS world `(x, -y, z)` projects identically to a WebGL mesh at `(x, y, z)`.
 */
function toCameraCSSMatrix(matrix: Matrix4): string {
  const e = matrix.elements;
  return (
    'matrix3d(' +
    eps(e[0]) + ',' + eps(-e[1]) + ',' + eps(e[2]) + ',' + eps(e[3]) + ',' +
    eps(-e[4]) + ',' + eps(e[5]) + ',' + eps(-e[6]) + ',' + eps(-e[7]) + ',' +
    eps(e[8]) + ',' + eps(-e[9]) + ',' + eps(e[10]) + ',' + eps(e[11]) + ',' +
    eps(e[12]) + ',' + eps(-e[13]) + ',' + eps(e[14]) + ',' + eps(e[15]) +
    ')'
  );
}

/**
 * The physical cinema projection screen at the front of the 3D auditorium (z = 0).
 * - For licensed direct video streams: projects a Three.js VideoTexture onto the 3D plane.
 * - For official YouTube trailers: projects the screen-plane-aligned YT.Player DOM surface
 *   onto the exact 3D coordinates `[0, cy, 0]` (`fw × fh` metres) every frame.
 */
export function ScreenMesh({ config }: { config: AuditoriumConfig }) {
  const version = useTrailer((s) => s.version);
  const aspect = useTrailer((s) => s.aspect);
  const source = useTrailer((s) => s.source);
  const playing = useTrailer((s) => s.playing);

  const { width: sw, height: sh, bottomY } = config.screen;
  const cy = bottomY + sh / 2;
  const wide = aspect > sw / sh;
  const fw = wide ? sw : sh * aspect;
  const fh = wide ? sw / aspect : sh;

  useFrame((state) => {
    const stageEl = trailer.stageEl;
    const cameraEl = trailer.cameraEl;
    const screenEl = trailer.screenEl;
    if (!stageEl || !cameraEl || !screenEl) return;

    const cam = state.camera as PerspectiveCamera;
    const W = state.size.width;
    const H = state.size.height;
    if (W <= 0 || H <= 0) return;

    const fovRad = (cam.fov * Math.PI) / 180;
    const fovPx = (0.5 / Math.tan(fovRad * 0.5)) * H;

    stageEl.style.perspective = `${fovPx.toFixed(2)}px`;
    cameraEl.style.transform = `translateZ(${fovPx.toFixed(2)}px) ${toCameraCSSMatrix(cam.matrixWorldInverse)} translate(${(W * 0.5).toFixed(2)}px, ${(H * 0.5).toFixed(2)}px)`;
    screenEl.style.transform = `translate(-50%, -50%) translate3d(0px, ${(-cy).toFixed(4)}px, 0px) scale3d(${(fw / 1280).toFixed(6)}, ${(fh / 720).toFixed(6)}, 1)`;
  });

  const tex = source === 'video' ? trailer.texture : null;

  return (
    <group>
      {/* Outer auditorium screen surround / masking frame */}
      <mesh position={[0, cy, -0.06]}>
        <planeGeometry args={[sw + 0.5, sh + 0.5]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Inner matte projection screen surface */}
      <mesh position={[0, cy, -0.02]}>
        <planeGeometry args={[sw, sh]} />
        <meshBasicMaterial color="#050506" />
      </mesh>
      {/* Direct HTML5 VideoTexture plane when a direct video stream is active */}
      {tex && (
        <mesh key={version} position={[0, cy, 0]}>
          <planeGeometry args={[fw, fh]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
      {/* Soft screen light spill onto the front auditorium rows when playing */}
      <pointLight
        position={[0, cy, 3]}
        intensity={playing ? 28 : 10}
        color="#d8e2ff"
        decay={2}
      />
    </group>
  );
}
