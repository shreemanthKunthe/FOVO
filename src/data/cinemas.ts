import type { AuditoriumConfig } from '../domain/types';
import { grandAuditorium, referenceAuditorium } from '../domain/layout/presets';

export interface Cinema {
  id: string;
  name: string;
  area: string;
  auditorium: AuditoriumConfig;
  format: string;
}

export const cinemas: Cinema[] = [
  { id: 'lumiere', name: 'Lumière Cinemas', area: 'Indiranagar', auditorium: referenceAuditorium, format: '2D · Screen 1' },
  { id: 'orion', name: 'Orion Grand', area: 'Koramangala', auditorium: grandAuditorium, format: '2D · Audi 3' },
];

export const SHOW_TIMES = ['11:00', '14:30', '18:15', '21:45'];

export const getCinema = (id: string | null) => cinemas.find((c) => c.id === id) ?? null;

/** Local-date ISO key, e.g. 2026-11-11. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nextDates(count = 3): { key: string; label: string; day: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      key: dateKey(d),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
      day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    };
  });
}

export function isPast(date: string, time: string, now = new Date()): boolean {
  if (date !== dateKey(now)) return false;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
}

