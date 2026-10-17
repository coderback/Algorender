import { createRng } from '@/engine/random';

// Small grayscale pictures for the SVD visualiser, drawn procedurally so they
// need no assets: 24×24, row by row from the top, 0 = black and 1 = white.

export const SIZE = 24;

export type ImageId = 'plus' | 'gradient' | 'checker' | 'letter' | 'smiley' | 'noise';

/** A picture as rows of pixel values. */
export type Picture = number[][];

function draw(shade: (x: number, y: number) => number): Picture {
  // Sample at pixel centres.
  return Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => shade(c + 0.5, r + 0.5)));
}

/** Distance from (x, y) to the segment from (ax, ay) to (bx, by). */
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

const PAPER = 1;
const INK = 0.1;

export function picture(id: ImageId, seed = 0): Picture {
  switch (id) {
    case 'plus':
      // A thick dark cross on white: rows 10–13 and columns 10–13.
      return draw((x, y) => (Math.abs(x - 12) < 2 || Math.abs(y - 12) < 2 ? INK : PAPER));
    case 'gradient':
      // Brightness rises from the top-left corner to the bottom-right one.
      return draw((x, y) => (x + y - 1) / (2 * SIZE - 2));
    case 'checker':
      // 4×4-pixel squares in two shades.
      return draw((x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 0.15 : 0.85));
    case 'letter':
      // A capital A: two slanted strokes and a crossbar.
      return draw((x, y) => {
        const d = Math.min(toSegment(x, y, 12, 3, 4.5, 21), toSegment(x, y, 12, 3, 19.5, 21), toSegment(x, y, 7.5, 14, 16.5, 14));
        return d < 1.6 ? INK : PAPER;
      });
    case 'smiley':
      return draw((x, y) => {
        const d = Math.hypot(x - 12, y - 12);
        if (Math.abs(d - 10) < 1) return INK;
        if (d > 10) return PAPER;
        if (Math.hypot(x - 8.5, y - 9.5) < 1.7 || Math.hypot(x - 15.5, y - 9.5) < 1.7) return INK;
        if (y > 13 && Math.abs(d - 6) < 0.9) return INK;
        return 0.8;
      });
    case 'noise': {
      const rng = createRng(seed);
      return draw(() => rng());
    }
  }
}
