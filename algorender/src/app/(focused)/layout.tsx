import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import { SessionSync } from '@/components/shell/SessionSync';

// Lessons, problems and the review session: no rail and no top bar. Each page
// draws its own focus header, with one way out.
export default function FocusedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionSync />
      {children}
    </>
  );
}
