import { Canvas } from '@react-three/fiber';
import type { AuditoriumConfig, Seat, SeatStatus } from '../../../domain/types';
import type { Quality } from '../../../store/viewStore';
import { Room } from './Room';
import { Seats3D } from './Seats3D';
import { ScreenMesh } from './ScreenMesh';
import { CameraRig } from './CameraRig';

interface Props {
  config: AuditoriumConfig;
  seats: Seat[];
  availability: Record<string, SeatStatus>;
  seat: Seat;
  quality: Quality;
}

export default function Scene({ config, seats, availability, seat, quality }: Props) {
  const high = quality === 'high';
  return (
    <Canvas
      key={quality}
      flat
      dpr={high ? [1, 1.75] : 1}
      gl={{ antialias: high, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 62, near: 0.1, far: 120, position: [0, 6, config.dims.length] }}
      style={{ touchAction: 'none', cursor: 'grab' }}
    >
      <color attach="background" args={['#050506']} />
      <fog attach="fog" args={['#050506', 22, 55]} />
      <Room config={config} />
      <ScreenMesh config={config} />
      <Seats3D config={config} seats={seats} availability={availability} selectedId={seat.id} showAudience={high} />
      <CameraRig seat={seat} config={config} />
    </Canvas>
  );
}

