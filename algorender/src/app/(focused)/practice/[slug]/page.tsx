import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProblem, loadProblems, specFor } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { ProblemWorkspace } from '@/problems/ui/ProblemWorkspace';
import { statementPanes } from '@/problems/ui/Statement';
import { tutorConfig } from '@/server/tutor/config';

export const dynamicParams = false;

export function generateStaticParams() {
  return loadProblems().map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const problem = getProblem((await params).slug);
  if (!problem) return {};
  return { title: `${problem.title} | Practice | Algorender`, description: `${problem.summary} Solve it in Python, JavaScript or TypeScript and watch your code run.` };
}

export default async function ProblemPage({ params }: Props) {
  const problem = getProblem((await params).slug);
  if (!problem) notFound();
  const spec = specFor(problem);
  const all = loadProblems();
  // The next problem with the same main pattern, else the next in the list.
  const after = all.slice(all.indexOf(problem) + 1);
  const next = after.find((p) => p.patterns[0] === problem.patterns[0]) ?? after[0];
  const pattern = PATTERNS[problem.patterns[0]];
  const siblings = all.filter((p) => p.patterns[0] === problem.patterns[0]);

  return (
    <main className="min-h-dvh">
      <ProblemWorkspace
        spec={spec}
        heading={{ title: problem.title, difficulty: problem.difficulty, crumb: `Practice · ${pattern.title} · ${siblings.indexOf(problem) + 1} of ${siblings.length}` }}
        statement={statementPanes(problem, spec.cases)}
        next={next && { slug: next.slug, title: next.title }}
        tutor={tutorConfig() !== null}
      />
    </main>
  );
}
