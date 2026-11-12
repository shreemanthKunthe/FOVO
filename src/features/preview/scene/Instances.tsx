import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _e = new Euler();

/** Writes position / x-rotation / y-rotation / scale into a matrix. */
export function compose(
  m: Matrix4,
  pos: [number, number, number],
  scale: [number, number, number],
  rx = 0,
  ry = 0,
): Matrix4 {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rx, ry, 0, 'YXZ'));
  _s.set(scale[0], scale[1], scale[2]);
  return m.compose(_p, _q, _s);
}

interface Props {
  count: number;
  /** Fill instance `i`. The matrix is pre-reset to identity. */
  fill: (i: number, m: Matrix4, c: Color) => void;
  useColor?: boolean;
  children: ReactNode;
}

/** One draw call for `count` copies. `fill` must be memoised by the caller. */
export function Instances({ count, fill, useColor = false, children }: Props) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const c = new Color();
    for (let i = 0; i < count; i++) {
      m.identity();
      c.set('#ffffff');
      fill(i, m, c);
      mesh.setMatrixAt(i, m);
      if (useColor) mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, fill, useColor]);
  return (
    <instancedMesh
      key={count}
      ref={ref}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args={[undefined as any, undefined as any, count]}
      frustumCulled={false}
    >
      {children}
    </instancedMesh>
  );
}

