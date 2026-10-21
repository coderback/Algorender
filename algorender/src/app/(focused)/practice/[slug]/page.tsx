import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FiArrowRight, FiPlay } from 'react-icons/fi';
import { getVisualiserBySlug } from '@/data/visualisers';
import { formatValue, type JudgeCase } from '@/problems/judge';
import { getProblem, loadProblems, specFor } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import type { Problem } from '@/problems/schema';
import { InlineMarkdown, Markdown } from '@/problems/ui/Markdown';
import { ProblemWorkspace, type StatementPanes } from '@/problems/ui/ProblemWorkspace';
import { tutorConfig } from '@/server/tutor/config';
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

function statementPanes(problem: Problem, cases: JudgeCase[]): StatementPanes {
  const pattern = PATTERNS[problem.patterns[0]];
  const examples = cases.filter((c) => c.group === 'example');
  const visualisers = problem.visualisers.map((slug) => ({ slug, v: getVisualiserBySlug(slug) })).filter((x) => x.v);
  return {
    problem: (
      <>
        <div className="text-[15px] leading-relaxed text-ink">
          <Markdown text={problem.statement} />
        </div>
        <div className="flex flex-col gap-3">
          {examples.map((c) => (
            <Example key={c.id} problem={problem} test={c} />
          ))}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Constraints</h2>
          <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-6 text-sm text-ink-soft">
            {problem.constraints.map((c, i) => (
              <li key={i}>
                <InlineMarkdown text={c} />
              </li>
            ))}
          </ul>
        </div>
      </>
    ),
    hints: (
      <>
        <Hints hints={problem.hints} />
        <Reveal title="Show the pattern">
          <p className="font-semibold text-ink">{problem.patterns.map((p) => PATTERNS[p].title).join(', ')}</p>
          <p className="mt-1">{problem.why}</p>
          {pattern.visualiser && (
            <Link href={`/visualisers/${pattern.visualiser}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
              See {pattern.title.toLowerCase()} in a visualiser <FiArrowRight aria-hidden />
            </Link>
          )}
        </Reveal>
      </>
    ),
    approach: (
      <Reveal title="Show the approach">
        <Markdown text={problem.approach} />
        <p className="mt-2 text-ink">
          <span className="font-semibold">Time:</span> {problem.complexity.time} · <span className="font-semibold">Space:</span> {problem.complexity.space}
        </p>
      </Reveal>
    ),
    brushUp: visualisers.length > 0 && (
      <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
        <span className="text-[13px] text-ink-muted">Brush up first</span>
        {visualisers.map(({ slug, v }) => (
          <Link
            key={slug}
            href={`/visualisers/${slug}`}
            className="flex items-center gap-3 rounded-[16px] bg-track-mint px-4 py-3 text-[15px] font-semibold text-track-mint-title transition-transform duration-150 ease-standard hover:-translate-y-0.5"
          >
            <FiPlay aria-hidden className="shrink-0" />
            {v!.name} visualiser
          </Link>
        ))}
      </div>
    ),
  };
}

function Example({ problem, test }: { problem: Problem; test: JudgeCase }) {
  const show = (v: Parameters<typeof formatValue>[0]) => formatValue(v, 'javascript');
  const input = test.calls
    ? test.calls.map(([m, ...args]) => `${m}(${args.map(show).join(', ')})`).join(', ')
    : (problem.signature?.params ?? []).map((p) => `${p.name} = ${show(test.input?.[p.name] ?? null)}`).join(', ');
  return (
    <div className="rounded-well bg-subtle px-4 py-3.5 text-sm">
      <p className="font-semibold text-ink">{test.label}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        <dt className="text-ink-muted">{test.calls ? 'Calls' : 'Input'}</dt>
        <dd className="font-mono text-[13px] break-words text-ink">{input}</dd>
        <dt className="text-ink-muted">{test.calls ? 'Returns' : 'Output'}</dt>
        <dd className="font-mono text-[13px] break-words text-ink">{show(test.expected)}</dd>
      </dl>
      {test.explanation && (
        <div className="mt-1.5 text-ink-soft">
          <InlineMarkdown text={test.explanation} />
        </div>
      )}
    </div>
  );
}

function Reveal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-well bg-sunken text-sm text-ink-soft">
      <summary className="cursor-pointer rounded-well px-4 py-3 font-semibold text-accent-ink">{title}</summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
