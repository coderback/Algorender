import type { Metadata } from 'next';
import { StudyPlan } from '@/components/plan/StudyPlan';
import { goals } from '@/content/goals';
import { masteryGraph, planCatalog } from '@/content/mastery';

export const metadata: Metadata = {
  title: 'Study plan | Algorender',
  description: 'Pick a goal and the hours you have each week: get a schedule over the concept map that skips what you know and re-plans as you learn.',
};

export default function PlanPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-3xl">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Plan</div>
        <h1 className="text-3xl font-bold text-ink">Your study plan</h1>
        <p className="mt-2 text-ink-soft">
          A goal and a few hours a week become a schedule over the concept map, in the order the ideas build on each other. It skips what
          you already know and re-plans as you learn: a concept drops off once your answers show you know it.
        </p>
      </header>
      <StudyPlan graph={masteryGraph()} goals={goals} catalog={planCatalog()} />
    </main>
  );
}
