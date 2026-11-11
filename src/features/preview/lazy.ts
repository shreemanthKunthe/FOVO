import { lazy } from 'react';

/** The 3D stack lives in its own chunk, loaded on demand (and prefetched when idle). */
export const loadPreview = () => import('./PreviewScreen');
export const PreviewScreen = lazy(loadPreview);

export function prefetchPreview(): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (n: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(() => void loadPreview());
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(() => void loadPreview(), 1200);
  return () => clearTimeout(id);
}

