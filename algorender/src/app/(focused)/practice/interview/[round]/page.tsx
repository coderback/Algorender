import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { InterviewRound } from '@/components/interview/InterviewRound';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { getConcept } from '@/content/concepts';
import { getVisualiserBySlug } from '@/data/visualisers';
import { getProblem, loadProblems, specFor } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { Markdown } from '@/problems/ui/Markdown';
import { statementPanes } from '@/problems/ui/Statement';
import { getAuth } from '@/server/auth';
import { getDatabase } from '@/server/db';
import { getRound, InterviewError, view } from '@/server/interview';
import { interviewConfig } from '@/server/interview/config';

// A mock interview round (src/components/interview/): read from the database
// for the signed-in learner, so the page starts from the server's round and
// clock. Its problem's statement is rendered here, as on the practice page.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mock interview | Algorender', robots: { index: false } };

type Props = { params: Promise<{ round: string }> };

export default async function InterviewRoundPage({ params }: Props) {
  const { round: id } = await params;
  const config = interviewConfig();
  if (!config) return <Off message="Mock interviews aren’t switched on here." />;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  let userId: string | null;
  try {
    const session = await (await getAuth()).api.getSession({ headers: await headers() });
    userId = session?.user.id ?? null;
  } catch {
    return <Off message="Accounts aren’t available right now, so this round can’t be opened. Try again in a moment." />;
  }
  if (!userId) redirect(`/account?next=${encodeURIComponent(`/practice/interview/${id}`)}`);
  let row;
  try {
    row = await getRound(await getDatabase(), userId, id);
  } catch (e) {
    if (e instanceof InterviewError) notFound();
    return <Off message="Accounts aren’t available right now, so this round can’t be opened. Try again in a moment." />;
  }
  const problem = getProblem(row.item);
  if (!problem) notFound();
  const spec = specFor(problem);
  const panes = statementPanes(problem, spec.cases);
  const pattern = PATTERNS[problem.patterns[0]];
  const lesson = pattern.concept ? getConcept(pattern.concept)?.lesson : undefined;
  const all = loadProblems();
  const similar = all.find((p) => p !== problem && p.patterns[0] === problem.patterns[0] && p.difficulty === problem.difficulty) ?? all.find((p) => p !== problem && p.patterns[0] === problem.patterns[0]);
  const links = [
    lesson && { href: `/learn/${lesson}`, label: `The ${pattern.title.toLowerCase()} lesson` },
    pattern.visualiser && getVisualiserBySlug(pattern.visualiser) && { href: `/visualisers/${pattern.visualiser}`, label: `See ${pattern.title.toLowerCase()} run` },
    similar && { href: `/practice/${similar.slug}`, label: `A similar problem: ${similar.title}` },
  ].filter((l): l is { href: string; label: string } => !!l);

  return (
    <main className="min-h-dvh">
      <InterviewRound
        initial={view(row, config, new Date())}
        spec={spec}
        heading={{ title: problem.title, difficulty: problem.difficulty, crumb: `Mock interview · ${row.limitMin} minutes` }}
        problem={panes.problem}
        debrief={{
          title: problem.title,
          complexity: problem.complexity,
          links,
          approach: (
            <>
              <Markdown text={problem.approach} />
              <p className="mt-2 text-ink">
                <span className="font-semibold">Pattern:</span> {problem.patterns.map((p) => PATTERNS[p].title).join(', ')} · <span className="font-semibold">Time:</span> {problem.complexity.time} ·{' '}
                <span className="font-semibold">Space:</span> {problem.complexity.space}
              </p>
              <p className="mt-1">{problem.why}</p>
            </>
          ),
        }}
      />
    </main>
  );
}

function Off({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <Alert tone="warn" title={message} role={null} />
      <ButtonLink href="/practice" kind="secondary" className="self-start">
        Back to practice
      </ButtonLink>
    </main>
  );
}
