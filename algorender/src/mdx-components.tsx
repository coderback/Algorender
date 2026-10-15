import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { Explore, PredictChallenge } from '@/components/lesson/Explore';
import { Quiz } from '@/components/lesson/Quiz';
import { KeyIdea, Misconception, Section, Term, Terms } from '@/components/lesson/Section';

// Styles for lesson prose, and the widgets lessons can use without importing them.
const components: MDXComponents = {
  h2: (props) => <h2 className="mt-8 mb-3 text-2xl font-bold text-ink" {...props} />,
  h3: (props) => <h3 className="mt-6 mb-2 text-lg font-semibold text-ink" {...props} />,
  p: (props) => <p className="leading-relaxed text-ink-soft" {...props} />,
  ul: (props) => <ul className="list-disc space-y-1.5 pl-6 text-ink-soft" {...props} />,
  ol: (props) => <ol className="list-decimal space-y-1.5 pl-6 text-ink-soft" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-ink" {...props} />,
  a: ({ href = '', ...props }: ComponentProps<'a'>) =>
    href.startsWith('/') ? (
      <Link href={href} className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2 hover:decoration-current" {...props} />
    ) : (
      <a href={href} target="_blank" rel="noopener" className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2" {...props} />
    ),
  code: (props) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.9em] text-ink" {...props} />,
  pre: (props) => (
    <pre className="overflow-x-auto rounded-xl border border-line bg-gray-900 p-4 font-mono text-sm leading-6 text-gray-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit" {...props} />
  ),
  blockquote: (props) => <blockquote className="border-l-4 border-line pl-4 text-ink-soft italic" {...props} />,
  hr: () => <hr className="my-8 border-line-soft" />,
  Section,
  Terms,
  Term,
  KeyIdea,
  Misconception,
  Explore,
  PredictChallenge,
  Quiz,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
