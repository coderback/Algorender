import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { getVisualiserBySlug } from '@/data/visualisers';
import { formatValue, type JudgeCase } from '@/problems/judge';
import { getProblem, loadProblems, specFor } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import type { Problem } from '@/problems/schema';
import { InlineMarkdown, Markdown } from '@/problems/ui/Markdown';
import { DIFFICULTY_STYLE } from '@/problems/ui/difficulty';
import { ProblemWorkspace } from '@/problems/ui/ProblemWorkspace';
import { Hints } from '@/workspace/Hints';

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

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/practice" className="mb-4 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
        <FiArrowLeft aria-hidden /> All problems
      </Link>
      <ProblemWorkspace spec={spec} statement={<Statement problem={problem} cases={spec.cases} />} next={next && { slug: next.slug, title: next.title }} />
    </main>
  );
}

function Statement({ problem, cases }: { problem: Problem; cases: JudgeCase[] }) {
  const pattern = PATTERNS[problem.patterns[0]];
  const examples = cases.filter((c) => c.group === 'example');
  const visualisers = problem.visualisers.map((slug) => ({ slug, v: getVisualiserBySlug(slug) })).filter((x) => x.v);
  return (
    <article aria-labelledby="problem-title" className="space-y-5 rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
      <header>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${DIFFICULTY_STYLE[problem.difficulty].className}`}>
          {DIFFICULTY_STYLE[problem.difficulty].label}
        </span>
        <h1 id="problem-title" className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
          {problem.title}
        </h1>
      </header>
      <Markdown text={problem.statement} />
      <div className="space-y-3">
        {examples.map((c) => (
          <Example key={c.id} problem={problem} test={c} />
        ))}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-ink">Constraints</h2>
        <ul className="mt-1 list-disc space-y-0.5 pl-6 text-sm text-ink-soft">
          {problem.constraints.map((c, i) => (
            <li key={i}>
              <InlineMarkdown text={c} />
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2 border-t border-line-soft pt-4">
        <Hints hints={problem.hints} />
        <Reveal title="Show the pattern">
          <p className="font-semibold text-ink">{problem.patterns.map((p) => PATTERNS[p].title).join(', ')}</p>
          <p className="mt-1">{problem.why}</p>
          {pattern.visualiser && (
            <Link href={`/visualisers/${pattern.visualiser}`} className="mt-2 inline-flex items-center gap-1 text-accent-ink hover:underline">
              See {pattern.title.toLowerCase()} in a visualiser <FiArrowRight aria-hidden />
            </Link>
          )}
        </Reveal>
        <Reveal title="Show the approach">
          <Markdown text={problem.approach} />
          <p className="mt-2 text-ink">
            <span className="font-semibold">Time:</span> {problem.complexity.time} · <span className="font-semibold">Space:</span> {problem.complexity.space}
          </p>
        </Reveal>
        {visualisers.length > 0 && (
          <p className="pt-1 text-sm text-ink-soft">
            Brush up first:{' '}
            {visualisers.map(({ slug, v }, i) => (
              <span key={slug}>
                {i > 0 && ', '}
                <Link href={`/visualisers/${slug}`} className="text-accent-ink underline decoration-accent-line underline-offset-2 hover:decoration-current">
                  {v!.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

function Example({ problem, test }: { problem: Problem; test: JudgeCase }) {
  const show = (v: Parameters<typeof formatValue>[0]) => formatValue(v, 'javascript');
  const input = test.calls
    ? test.calls.map(([m, ...args]) => `${m}(${args.map(show).join(', ')})`).join(', ')
    : (problem.signature?.params ?? []).map((p) => `${p.name} = ${show(test.input?.[p.name] ?? null)}`).join(', ');
  return (
    <div className="rounded-lg border border-line-soft bg-subtle px-4 py-3 text-sm">
      <p className="font-semibold text-ink">{test.label}</p>
      <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        <dt className="text-ink-muted">{test.calls ? 'Calls' : 'Input'}</dt>
        <dd className="font-mono text-[13px] break-words text-ink">{input}</dd>
        <dt className="text-ink-muted">{test.calls ? 'Returns' : 'Output'}</dt>
        <dd className="font-mono text-[13px] break-words text-ink">{show(test.expected)}</dd>
      </dl>
      {test.explanation && (
        <div className="mt-1 text-ink-soft">
          <InlineMarkdown text={test.explanation} />
        </div>
      )}
    </div>
  );
}

function Reveal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-line-soft text-sm text-ink-soft open:bg-subtle">
      <summary className="cursor-pointer rounded-lg px-3 py-2 font-medium text-accent-ink hover:bg-sunken">{title}</summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
