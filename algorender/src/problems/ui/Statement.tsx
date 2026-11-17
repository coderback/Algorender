import Link from 'next/link';
import type { ReactNode } from 'react';
import { FiArrowRight, FiPlay } from 'react-icons/fi';
import { getVisualiserBySlug } from '@/data/visualisers';
import { Hints } from '@/workspace/Hints';
import { formatValue, type JudgeCase } from '../judge';
import { PATTERNS } from '../patterns';
import type { Problem } from '../schema';
import { InlineMarkdown, Markdown } from './Markdown';
import type { StatementPanes } from './ProblemWorkspace';

// A problem's statement card panes, rendered on the server: the problem
// (statement, examples, constraints), the hints, the approach, and the
// visualisers to brush up on. The practice page shows them all; a mock
// interview shows the problem alone, and the approach once it has ended.

export function statementPanes(problem: Problem, cases: JudgeCase[]): StatementPanes {
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

export function Reveal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-well bg-sunken text-sm text-ink-soft">
      <summary className="cursor-pointer rounded-well px-4 py-3 font-semibold text-accent-ink">{title}</summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
