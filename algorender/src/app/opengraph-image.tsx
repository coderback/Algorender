import { OG_SIZE, ogCard } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Algorender: see algorithms work, predict each step, and learn why';

export default function Image() {
  return ogCard({
    eyebrow: 'Learn by seeing and predicting',
    title: 'Algorithms and data structures, step by step',
    detail: 'Step through every algorithm forwards and backwards, predict each move, and follow lessons that build on each other.',
  });
}
