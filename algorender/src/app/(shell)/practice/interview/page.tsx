import type { Metadata } from 'next';
import { InterviewHub } from '@/components/interview/InterviewHub';
import { PracticeHeader } from '@/components/practice/PracticeHeader';
import { caseStudies } from '@/content/designs';
import { variantsOf } from '@/content/designs/interviews';
import { loadProblems } from '@/problems/load';
import { PATTERN_IDS, PATTERNS } from '@/problems/patterns';
import { interviewConfig } from '@/server/interview/config';

export const metadata: Metadata = {
  title: 'Mock interviews | Algorender',
  description:
    'A timed coding or system-design interview with an AI interviewer: explain your approach, code or design it, test it or survive a failure, then a debrief that scores each part.',
};

export default function InterviewsPage() {
  const problems = loadProblems();
  // Only patterns some problem uses can be asked for.
  const patterns = PATTERN_IDS.filter((p) => problems.some((x) => x.patterns.includes(p))).map((id) => ({ id, title: PATTERNS[id].title }));
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PracticeHeader
        active="interview"
        intro="A timed coding or system-design interview with an AI interviewer who asks rather than teaches: say how you’d solve it, build it, test it or survive a failure. Then a debrief scores each part."
      />
      {/* Pages read the switch at build time, like the tutor's. */}
      <InterviewHub
        enabled={interviewConfig() !== null}
        patterns={patterns}
        problems={problems.length}
        cases={caseStudies.map((c) => ({ slug: c.slug, title: c.title, variants: variantsOf(c.slug).length }))}
      />
    </main>
  );
}
