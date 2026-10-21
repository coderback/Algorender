import type { ReactNode } from 'react';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { lessons } from '@/content/lessons';

export type LearnTab = 'path' | 'lessons' | 'plan' | 'placement';

const HREF: Record<LearnTab, string> = { path: '/learn', lessons: '/learn?tab=lessons', plan: '/plan', placement: '/learn/placement' };

/**
 * The Learn hub's header: its title and the section tabs (Path, Lessons, Plan,
 * Placement check). `aside` sits to the right of the tabs (the path legend).
 */
export function LearnHeader({ active, aside, title = true }: { active: LearnTab; aside?: ReactNode; title?: boolean }) {
  return (
    <header className="flex flex-col gap-5">
      {title && <h1 className="font-display text-title-page">Learn</h1>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionTabs
          active={HREF[active]}
          tabs={[
            { href: HREF.path, label: 'Path' },
            { href: HREF.lessons, label: 'Lessons', count: lessons.length },
            { href: HREF.plan, label: 'Plan' },
            { href: HREF.placement, label: 'Placement check' },
          ]}
        />
        {aside}
      </div>
    </header>
  );
}
