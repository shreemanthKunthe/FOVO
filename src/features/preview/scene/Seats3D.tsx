import { useCallback, useMemo } from 'react';
import type { Color, Matrix4 } from 'three';
import { Color as ThreeColor } from 'three';
import type { AuditoriumConfig, Seat, SeatStatus, SectionDef } from '../../../domain/types';
import { hashString } from '../../../data/mockAvailability';
import { Instances, compose } from './Instances';

interface Props {
  config: AuditoriumConfig;
  seats: Seat[];
  availability: Record<string, SeatStatus>;
  selectedId: string | null;
  showAudience: boolean;
}

type V3 = [number, number, number];
interface Part {
  key: string;
  tinted: boolean;
  include: (s: SectionDef) => boolean;
  place: (s: SectionDef, w: number, d: number) => { p: V3; s: V3; rx?: number };
}

const seatDepth = (s: SectionDef) => (s.seatStyle === 'lounger' ? 0.85 : 0.52);
const seatWidth = (s: SectionDef) => s.seatPitch * 0.92;

const PARTS: Part[] = [
  {
    key: 'cushion', tinted: true, include: () => true,
    place: (s, w, d) => ({ p: [0, s.seatHeight - 0.07, 0], s: [w, 0.14, d] }),
  },
  {
    key: 'back', tinted: true, include: () => true,
    place: (s, w, d) => ({
      p: [0, s.seatHeight + 0.28, d / 2 - 0.04],
      s: [w * 0.96, 0.62, 0.1],
      rx: s.seatStyle === 'standard' ? 0.12 : 0.28,
    }),
  },
  {
    key: 'armL', tinted: false, include: () => true,
    place: (s, w, d) => ({ p: [-(w / 2 - 0.04), s.seatHeight + 0.12, -0.02], s: [0.08, 0.08, d * 0.85] }),
  },
  {
    key: 'armR', tinted: false, include: () => true,
    place: (s, w, d) => ({ p: [w / 2 - 0.04, s.seatHeight + 0.12, -0.02], s: [0.08, 0.08, d * 0.85] }),
  },
  {
    key: 'base', tinted: false, include: () => true,
    place: (s) => ({ p: [0, (s.seatHeight - 0.14) / 2, 0.05], s: [0.14, s.seatHeight - 0.14, 0.2] }),
  },
  {
    key: 'footrest', tinted: false, include: (s) => s.seatStyle !== 'standard',
    place: (_s, w, d) => ({ p: [0, 0.22, -d / 2 - 0.12], s: [w * 0.8, 0.07, 0.36] }),
  },
];

const DARK = new ThreeColor('#1b1b1f');
const OCCUPIED = new ThreeColor('#2c2c31');
const UNAVAILABLE = new ThreeColor('#3a2424');
const SELECTED = new ThreeColor('#E5B84B');
const HEAD_TONES = ['#2a211c', '#1d1a17', '#3a2b22', '#262626', '#31251d'].map((c) => new ThreeColor(c));
const TORSO_TONES = ['#22262e', '#2a2226', '#1f2a25', '#2b2b2b', '#2e2a22'].map((c) => new ThreeColor(c));

/**
 * Every chair is drawn from a few InstancedMeshes (one per part), so a full
 * auditorium costs ~8 draw calls regardless of seat count.
 */
export function Seats3D({ config, seats, availability, selectedId, showAudience }: Props) {
  const occupants = useMemo(
    () => (showAudience ? seats.filter((s) => availability[s.id] === 'occupied' && s.id !== selectedId) : []),
    [seats, availability, selectedId, showAudience],
  );

  return (
    <group>
      {PARTS.map((part) => (
        <SeatPart key={part.key} part={part} config={config} seats={seats} availability={availability} selectedId={selectedId} />
      ))}
      <Audience config={config} occupants={occupants} />
    </group>
  );
}

function SeatPart({
  part, config, seats, availability, selectedId,
}: { part: Part; config: AuditoriumConfig; seats: Seat[] } & Pick<Props, 'availability' | 'selectedId'>) {
  const list = useMemo(() => seats.filter((s) => part.include(config.sections[s.section])), [seats, config, part]);
  const base = useMemo(() => {
    const out = {} as Record<string, ThreeColor>;
    for (const sec of Object.values(config.sections)) out[sec.id] = new ThreeColor(sec.color).multiplyScalar(0.42);
    return out;
  }, [config]);

  const fill = useCallback(
    (i: number, m: Matrix4, c: Color) => {
      const seat = list[i];
      const sec = config.sections[seat.section];
      const pl = part.place(sec, seatWidth(sec), seatDepth(sec));
      const [x, y, z] = seat.world.position;
      compose(m, [x + pl.p[0], y + pl.p[1], z + pl.p[2]], pl.s, pl.rx ?? 0);
      if (!part.tinted) c.copy(DARK);
      else if (seat.id === selectedId) c.copy(SELECTED);
      else {
        const st = availability[seat.id];
        if (st === 'occupied') c.copy(OCCUPIED);
        else if (st === 'unavailable') c.copy(UNAVAILABLE);
        else c.copy(base[seat.section]);
      }
    },
    [list, config, part, availability, selectedId, base],
  );

  return (
    <Instances count={list.length} fill={fill} useColor>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.85} />
    </Instances>
  );
}

/** Simple head + torso silhouettes on occupied seats; heights respect the sightline rules. */
function Audience({ config, occupants }: { config: AuditoriumConfig; occupants: Seat[] }) {
  const fillHead = useCallback(
    (i: number, m: Matrix4, c: Color) => {
      const s = occupants[i];
      const sec = config.sections[s.section];
      const [x, y, z] = s.world.position;
      compose(m, [x, y + sec.seatHeight + sec.eyeOffset - 0.02, z + 0.1], [1, 1, 1]);
      c.copy(HEAD_TONES[hashString(s.id) % HEAD_TONES.length]);
    },
    [occupants, config],
  );
  const fillTorso = useCallback(
    (i: number, m: Matrix4, c: Color) => {
      const s = occupants[i];
      const sec = config.sections[s.section];
      const [x, y, z] = s.world.position;
      compose(m, [x, y + sec.seatHeight + 0.38, z + 0.14], [0.4, 0.55, 0.2]);
      c.copy(TORSO_TONES[hashString(s.id + 't') % TORSO_TONES.length]);
    },
    [occupants, config],
  );
  return (
    <>
      <Instances count={occupants.length} fill={fillHead} useColor>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial roughness={1} />
      </Instances>
      <Instances count={occupants.length} fill={fillTorso} useColor>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </Instances>
    </>
  );
}

