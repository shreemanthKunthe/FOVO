import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { AuditoriumConfig, Seat } from '../../../domain/types';
import { computeCameraPose, screenCentre } from '../../../domain/viewing';
import { audioEngine } from '../../audio/AudioEngine';
import { useViewStore } from '../../../store/viewStore';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MAX_LOOK_YAW = 1.0; // ~57 degrees each way
const MAX_LOOK_UP = 0.5;

/**
 * First-person rig. The camera physically sits at the seat's eye position and
 * glides between seats. A drag lets the viewer look around the way a seated
 * person turns their head. Pose is held in refs so no React re-render happens per frame.
 */
export function CameraRig({ seat, config }: { seat: Seat; config: AuditoriumConfig }) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const recenterTick = useViewStore((s) => s.recenterTick);

  const r = useRef({
    ready: false,
    pos: new Vector3(), yaw: 0, pitch: 0,
    fromPos: new Vector3(), fromYaw: 0, fromPitch: 0,
    toPos: new Vector3(), toYaw: 0, toPitch: 0,
    t: 1, dur: 1, lift: 0,
    uYaw: 0, uPitch: 0, recenter: false,
  });
  const fwd = useRef(new Vector3());

  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  // New target seat -> start a transition.
  useEffect(() => {
    const s = r.current;
    const pose = computeCameraPose(seat);
    s.toPos.set(...pose.position);
    s.toYaw = pose.yaw;
    s.toPitch = pose.pitch;
    if (!s.ready) {
      // Fly-in from the back of the room, above the aisle.
      const sc = screenCentre(config);
      s.pos.set(0, config.dims.height - 1.5, config.dims.length - 1);
      s.yaw = 0;
      s.pitch = Math.atan2(sc[1] - s.pos.y, s.pos.z);
      s.ready = true;
      s.dur = 2.4;
      s.lift = 0;
    } else {
      const dist = s.pos.distanceTo(s.toPos);
      s.dur = Math.min(1.8, Math.max(0.9, 0.7 + dist * 0.12));
      s.lift = Math.min(0.45, dist * 0.06);
    }
    s.fromPos.copy(s.pos);
    s.fromYaw = s.yaw;
    s.fromPitch = s.pitch;
    s.t = 0;
    s.recenter = true;
  }, [seat, config]);

  useEffect(() => {
    r.current.recenter = true;
  }, [recenterTick]);

  // Drag to look around.
  useEffect(() => {
    let down = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      down = true;
      lx = e.clientX;
      ly = e.clientY;
      r.current.recenter = false;
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const s = r.current;
      s.uYaw = Math.max(-MAX_LOOK_YAW, Math.min(MAX_LOOK_YAW, s.uYaw + (e.clientX - lx) * 0.004));
      s.uPitch = Math.max(-MAX_LOOK_UP, Math.min(MAX_LOOK_UP, s.uPitch + (e.clientY - ly) * 0.003));
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      down = false;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
    };
  }, [dom]);

  useFrame((_, rawDt) => {
    const s = r.current;
    const dt = Math.min(rawDt, 0.05);
    if (s.t < 1) {
      s.t = Math.min(1, s.t + dt / s.dur);
      const e = ease(s.t);
      s.pos.lerpVectors(s.fromPos, s.toPos, e);
      s.pos.y += Math.sin(Math.PI * e) * s.lift;
      s.yaw = s.fromYaw + (s.toYaw - s.fromYaw) * e;
      s.pitch = s.fromPitch + (s.toPitch - s.fromPitch) * e;
    }
    if (s.recenter) {
      const k = Math.min(1, dt * 5);
      s.uYaw -= s.uYaw * k;
      s.uPitch -= s.uPitch * k;
      if (Math.abs(s.uYaw) < 1e-3 && Math.abs(s.uPitch) < 1e-3) {
        s.uYaw = s.uPitch = 0;
        s.recenter = false;
      }
    }
    camera.position.copy(s.pos);
    camera.rotation.set(s.pitch + s.uPitch, s.yaw + s.uYaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd.current);
    audioEngine.setListener([s.pos.x, s.pos.y, s.pos.z], [fwd.current.x, fwd.current.y, fwd.current.z]);
  });

  return null;
}

