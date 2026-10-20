import type { Metadata } from 'next';
import { AccountPanel, type AccountData } from '@/components/account/AccountPanel';
import { goals } from '@/content/goals';
import { lessons } from '@/content/lessons';
import { masteryGraph } from '@/content/mastery';
import { PROBLEM_LANGUAGES } from '@/problems/languages';
import { loadProblems } from '@/problems/load';
import { socialProviders } from '@/server/providers';

export const metadata: Metadata = {
  title: 'Your account | Algorender',
  description: 'Sign in to keep your lessons, solved problems and review cards in sync across devices.',
  robots: { index: false },
};

/** The names the activity list shows, compact: everything about the learner comes from their events. */
function accountData(): AccountData {
  return {
    graph: masteryGraph(),
    titles: {
      lessons: Object.fromEntries(lessons.map((l) => [l.slug, l.title])),
      problems: Object.fromEntries(loadProblems().map((p) => [p.slug, p.title])),
      goals: Object.fromEntries(goals.map((g) => [g.id, g.title])),
      languages: Object.fromEntries(Object.entries(PROBLEM_LANGUAGES).map(([id, l]) => [id, l.label])),
    },
  };
}

// Each state draws its own <main>: the sign-in screen, or the learner's account.
export default function AccountPage() {
  return <AccountPanel providers={socialProviders()} data={accountData()} />;
}
