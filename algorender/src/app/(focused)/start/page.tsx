import type { Metadata } from 'next';
import { Onboarding } from '@/components/start/Onboarding';
import { goals } from '@/content/goals';
import { masteryGraph, placementQuestions, planCatalog } from '@/content/mastery';

export const metadata: Metadata = {
  title: 'Start learning | Algorender',
  description: 'Pick a goal and the hours you have, take a short placement check, and get a study plan that skips what you already know.',
};

export default function StartPage() {
  const minutes = Object.fromEntries(Object.entries(planCatalog()).map(([id, c]) => [id, c.minutes]));
  return <Onboarding goals={goals} graph={masteryGraph()} minutes={minutes} questions={placementQuestions()} />;
}
