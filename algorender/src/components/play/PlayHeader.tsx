import type { ReactNode } from 'react';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { GAMES } from '@/play/games';

/**
 * The Play hub's header: a title, a line under it and the section tabs (Hub
 * and the three games). `title` defaults to "Play"; a game page names itself.
 */
export function PlayHeader({ active, title = 'Play', intro, aside }: { active: string; title?: string; intro?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-title-page">{title}</h1>
          {intro && <p className="max-w-[900px] text-base leading-relaxed text-ink-soft">{intro}</p>}
        </div>
        <SectionTabs active={active} label="Play" tabs={[{ href: '/play', label: 'Hub' }, ...GAMES.map((g) => ({ href: g.href, label: g.title }))]} />
      </div>
      {aside}
    </header>
  );
}
