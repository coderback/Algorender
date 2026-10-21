import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';

// Visualisers and the sorting race: the rail, but no top bar, so the stage gets
// the room. On phones each page's own header carries the back button.
export default function DetailLayout({ children }: { children: ReactNode }) {
  return <AppShell topBar={false} phoneHeader={false}>{children}</AppShell>;
}
