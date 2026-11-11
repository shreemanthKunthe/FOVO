import { create } from 'zustand';

export type Quality = 'high' | 'low';

function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  return coarse && (mem <= 4 || cores <= 4) ? 'low' : 'high';
}

/** UI-only view state, kept apart from booking state. */
interface ViewState {
  quality: Quality;
  /** Increment to recentre the first-person look direction. */
  recenterTick: number;
  setQuality: (q: Quality) => void;
  recenter: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  quality: detectQuality(),
  recenterTick: 0,
  setQuality: (quality) => set({ quality }),
  recenter: () => set((s) => ({ recenterTick: s.recenterTick + 1 })),
}));
