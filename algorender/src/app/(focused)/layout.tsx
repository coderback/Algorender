import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import { FocusBar } from '@/components/shell/PhoneHeader';
import { SessionSync } from '@/components/shell/SessionSync';

// Lessons, problems and the review session: no rail and no top bar, one way out.
export default function FocusedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionSync />
      <FocusBar />
      {children}
    </>
  );
}
