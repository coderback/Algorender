import type { ReactNode } from 'react';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { caseStudies } from '@/content/designs';
import { exercises } from '@/content/exercises';
import { loadProblems } from '@/problems/load';

export type PracticeTab = 'problems' | 'code' | 'drills' | 'design';

const HREF: Record<PracticeTab, string> = { problems: '/practice', code: '/code', drills: '/practice/drills', design: '/design' };

/**
 * The Practice hub's header: its title and the section tabs (Problems, Code it,
 * Pattern drills, System design), with counts from content. `aside` sits on
 * the right (the solved tiles on Problems).
 */
export function PracticeHeader({ active, title = 'Practice', aside, intro }: { active: PracticeTab; title?: string; aside?: ReactNode; intro?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-title-page">{title}</h1>
          {intro && <p className="max-w-[900px] text-base leading-relaxed text-ink-soft">{intro}</p>}
        </div>
        <SectionTabs
          active={HREF[active]}
          tabs={[
            { href: HREF.problems, label: 'Problems', count: loadProblems().length },
            { href: HREF.code, label: 'Code it', count: exercises.length },
            { href: HREF.drills, label: 'Pattern drills' },
            { href: HREF.design, label: 'System design', count: caseStudies.length },
          ]}
        />
      </div>
      {aside}
    </header>
  );
}
