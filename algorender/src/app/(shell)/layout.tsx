import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';

// Hubs and the pages below them: the rail, the top bar and, on phones, the tab bar.
export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
