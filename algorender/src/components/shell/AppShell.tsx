import type { ReactNode } from 'react';
import { PaletteProvider } from './CommandPalette';
import { PhoneHeader } from './PhoneHeader';
import { Rail } from './Rail';
import { SessionSync } from './SessionSync';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * The app frame. Desktop: the rail beside the page, with the top bar (search
 * and XP) on hub and sub-pages; detail pages (visualisers, the race) drop the
 * top bar. Phones: a header row and, on hubs, the bottom tab bar.
 */
export function AppShell({ topBar = true, children }: { topBar?: boolean; children: ReactNode }) {
  return (
    <PaletteProvider>
      <SessionSync />
      <a
        href="#content"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>
      <div className="min-h-dvh md:flex md:items-start md:gap-4 md:p-4">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col gap-6 pb-28 md:px-2 md:pt-1 md:pb-6">
          {topBar && <TopBar />}
          <PhoneHeader />
          <div id="content" tabIndex={-1} className="min-w-0 outline-none">
            {children}
          </div>
        </div>
      </div>
      <TabBar />
    </PaletteProvider>
  );
}
