import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';

// Placement questions and concept summaries can hold math.
export default function LearnLayout({ children }: { children: ReactNode }) {
  return children;
}
