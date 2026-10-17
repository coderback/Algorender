import type { ReactNode } from 'react';
import Header from '@/components/Header';

export default function CodeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      {children}
    </div>
  );
}
