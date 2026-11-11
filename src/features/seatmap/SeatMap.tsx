import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditoriumConfig, Seat, SeatStatus } from '../../domain/types';
import { createMapTransform } from '../../domain/coords';

interface Props {
  config: AuditoriumConfig;
  seats: Seat[];
  availability: Record<string, SeatStatus>;
  selectedId: string | null;
  pinnedId?: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const SEAT_H = 18;
const MAX_ZOOM = 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const SeatMap = memo(function SeatMap({
  config, seats, availability, selectedId, pinnedId, onSelect, compact,
}: Props) {
  const t = useMemo(
    () => createMapTransform(seats.map((s) => ({ x: s.world.position[0], z: s.world.position[2] }))),
    [seats],
  );
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppress = useRef(false);

  const fit = (k: number, x: number, y: number) => ({
    k,
    x: clamp(x, t.width * (1 - k), 0),
    y: clamp(y, t.height * (1 - k), 0),
  });
  const zoomAt = (factor: number, px: number, py: number) =>
    setView((v) => {
      const k = clamp(v.k * factor, 1, MAX_ZOOM);
      const f = k / v.k;
      return fit(k, px - (px - v.x) * f, py - (py - v.y) * f);
    });
  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((cx - r.left) * t.width) / r.width, y: ((cy - r.top) * t.height) / r.height };
  };

  // Wheel zoom needs a non-passive listener to stop page scroll.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const headings = useMemo(
    () =>
      Object.values(config.sections).map((sec) => {
        const ys = seats.filter((s) => s.section === sec.id).map((s) => s.map.y);
        return { id: sec.id, label: sec.label, price: sec.price, y: Math.min(...ys) - 22 };
      }),
    [config, seats],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    suppress.current = false;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true;
      suppress.current = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    if (d.moved && view.k > 1) {
      const r = svgRef.current!.getBoundingClientRect();
      setView((v) => fit(v.k, d.ox + (dx * t.width) / r.width, d.oy + (dy * t.height) / r.height));
    }
  };
  const endDrag = () => {
    drag.current = null;
  };

  const choose = (s: Seat) => {
    if (suppress.current) return;
    if (availability[s.id] === 'available') onSelect(s.id);
  };

  return (
    <div className={'seatmap' + (compact ? ' compact' : '')}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${t.width} ${t.height}`}
        width="100%"
        role="group"
        aria-label="Seat map. Screen is at the bottom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: view.k > 1 ? 'none' : 'pan-y' }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {headings.map((h) => (
            <text key={h.id} x={t.width / 2} y={h.y} textAnchor="middle" className="sm-heading">
              ₹{h.price} {h.label.toUpperCase()} ROWS
            </text>
          ))}
          {seats.map((s) => {
            const status = availability[s.id] ?? 'available';
            const sec = config.sections[s.section];
            const selected = selectedId === s.id;
            const pinned = pinnedId === s.id;
            const w = Math.min(22, sec.seatPitch * t.scale * 0.82);
            const interactive = status === 'available';
            let fill = 'transparent';
            let stroke = sec.color;
            let dash: string | undefined;
            if (status === 'occupied') { fill = '#2a2a2f'; stroke = '#2a2a2f'; }
            else if (status === 'unavailable') { stroke = '#4a4a52'; dash = '3 2'; }
            if (selected) { fill = '#f2e6c9'; stroke = '#f2e6c9'; }
            return (
              <g key={s.id}>
                <rect
                  x={s.map.x - w / 2}
                  y={s.map.y - SEAT_H / 2}
                  width={w}
                  height={SEAT_H}
                  rx={3}
                  fill={fill}
                  stroke={stroke}
                  strokeDasharray={dash}
                  strokeWidth={selected ? 2 : 1.2}
                  className={'seat' + (interactive ? ' seat-ok' : '')}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={`Seat ${s.id}, ${sec.label}, ${status}${selected ? ', selected' : ''}`}
                  aria-pressed={interactive ? selected : undefined}
                  onClick={() => choose(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(s);
                    }
                  }}
                >
                  <title>{`${s.id} · ${sec.label} · ₹${sec.price}${interactive ? '' : status === 'occupied' ? ' (sold)' : ' (unavailable)'}`}</title>
                </rect>
                {pinned && !selected && (
                  <rect
                    x={s.map.x - w / 2 - 2} y={s.map.y - SEAT_H / 2 - 2} width={w + 4} height={SEAT_H + 4}
                    rx={4} fill="none" stroke="#f2e6c9" strokeDasharray="3 2" pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
          <g transform={`translate(${t.width / 2} ${t.screenY})`} pointerEvents="none">
            <path d="M-140 0 L140 0 L118 -26 L-118 -26 Z" fill="#1c2535" stroke="#3b4d6b" />
            <path d="M-8 -48 L0 -58 L8 -48" fill="none" stroke="#6f7a8c" strokeWidth="1.5" />
            <text y={20} textAnchor="middle" className="sm-screen">SCREEN · all eyes this way</text>
          </g>
        </g>
      </svg>
      <div className="zoom" role="group" aria-label="Zoom">
        <button onClick={() => zoomAt(1.4, t.width / 2, t.height / 2)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomAt(1 / 1.4, t.width / 2, t.height / 2)} aria-label="Zoom out">−</button>
        <button onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Reset zoom">⟲</button>
      </div>
    </div>
  );
});
