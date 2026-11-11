import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function make(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Procedural acoustic-panel wall: vertical fabric slats with soft seams. */
export function makeWallTexture(): CanvasTexture {
  return make(256, (g, s) => {
    g.fillStyle = '#17171b';
    g.fillRect(0, 0, s, s);
    const slat = s / 4;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#1d1d23' : '#141418';
      g.fillRect(i * slat + 2, 6, slat - 4, s - 12);
    }
    g.fillStyle = '#0c0c0f';
    g.fillRect(0, 0, s, 4);
    g.fillRect(0, s - 4, s, 4);
  });
}

/** Procedural dark patterned carpet. */
export function makeCarpetTexture(): CanvasTexture {
  return make(128, (g, s) => {
    g.fillStyle = '#1b1517';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      const v = 20 + Math.floor(Math.random() * 18);
      g.fillStyle = `rgb(${v + 8},${v},${v + 2})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  });
}

