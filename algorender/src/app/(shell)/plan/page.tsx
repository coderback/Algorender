import type { Metadata } from 'next';
import { LearnHeader } from '@/components/learn/LearnHeader';
import { StudyPlan } from '@/components/plan/StudyPlan';
import { goals } from '@/content/goals';
import { masteryGraph, planCatalog } from '@/content/mastery';

export const metadata: Metadata = {
  title: 'Study plan | Algorender',
  description: 'Pick a goal and the hours you have each week: get a schedule over the concept map that skips what you know and re-plans as you learn.',
};

// /plan keeps its URL but lives inside Learn: the Learn place and the Plan tab are active.
export default function PlanPage() {
  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <LearnHeader active="plan" />
      <StudyPlan graph={masteryGraph()} goals={goals} catalog={planCatalog()} />
    </main>
  );
}
