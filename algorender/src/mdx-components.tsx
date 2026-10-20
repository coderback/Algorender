import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { DesignLab } from '@/components/design/DesignLab';
import { EstimationDrill } from '@/components/design/EstimationDrill';
import { CodeExercise, PredictCode, TraceCode } from '@/components/lesson/CodeWidgets';
import { ExplainBack } from '@/components/lesson/ExplainBack';
import { Explore, PredictChallenge } from '@/components/lesson/Explore';
import { Quiz } from '@/components/lesson/Quiz';
import { KeyIdea, Misconception, Section, Term, Terms } from '@/components/lesson/Section';

// Styles for lesson prose, and the widgets lessons can use without importing them.
const components: MDXComponents = {
  h2: (props) => <h2 className="mt-6 font-display text-title-section text-ink" {...props} />,
  h3: (props) => <h3 className="mt-4 text-lg font-semibold text-ink" {...props} />,
  p: (props) => <p className="text-[16px] leading-relaxed text-ink-soft" {...props} />,
  ul: (props) => <ul className="list-disc space-y-1.5 pl-6 text-[16px] text-ink-soft" {...props} />,
  ol: (props) => <ol className="list-decimal space-y-1.5 pl-6 text-[16px] text-ink-soft" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-ink" {...props} />,
  a: ({ href = '', ...props }: ComponentProps<'a'>) =>
    href.startsWith('/') ? (
      <Link href={href} className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2 hover:decoration-current" {...props} />
    ) : (
      <a href={href} target="_blank" rel="noopener" className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2" {...props} />
    ),
  code: (props) => <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-ink" {...props} />,
  pre: (props) => (
    <pre className="overflow-x-auto rounded-well bg-code p-5 font-mono text-[13px] leading-6 text-code-ink [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit" {...props} />
  ),
  blockquote: (props) => <blockquote className="rounded-r-well border-l-4 border-accent-line bg-surface py-3 pr-4 pl-4 text-ink-soft" {...props} />,
  hr: () => <hr className="my-8 border-line-soft" />,
  Section,
  Terms,
  Term,
  KeyIdea,
  Misconception,
  Explore,
  PredictChallenge,
  Quiz,
  ExplainBack,
  CodeExercise,
  PredictCode,
  TraceCode,
  EstimationDrill,
  DesignLab,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
