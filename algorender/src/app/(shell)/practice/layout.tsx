import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';

// Problem statements in drills can hold math.
export default function PracticeLayout({ children }: { children: ReactNode }) {
  return children;
}
