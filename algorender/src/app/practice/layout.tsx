import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import Header from '@/components/Header';

export default function PracticeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      {children}
    </div>
  );
}
