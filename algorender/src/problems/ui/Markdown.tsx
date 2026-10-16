import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

// Problem text (statements, explanations, approaches) is Markdown in the
// problem's YAML, rendered with the same look as lesson prose. No raw HTML:
// react-markdown escapes it.

/** react-markdown hands each element its syntax-tree `node` too; the DOM mustn't get it. */
function clean<P extends object>(props: P): Omit<P, 'node'> {
  const rest = { ...props } as P & { node?: unknown };
  delete rest.node;
  return rest;
}

const components: Components = {
  p: (props) => <p className="leading-relaxed" {...clean(props)} />,
  ul: (props) => <ul className="list-disc space-y-1 pl-6" {...clean(props)} />,
  ol: (props) => <ol className="list-decimal space-y-1 pl-6" {...clean(props)} />,
  li: (props) => <li className="leading-relaxed" {...clean(props)} />,
  strong: (props) => <strong className="font-semibold text-ink" {...clean(props)} />,
  code: (props) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.9em] text-ink" {...clean(props)} />,
  pre: (props) => <pre className="overflow-x-auto rounded-lg border border-line bg-sunken p-3 font-mono text-sm text-ink [&_code]:bg-transparent [&_code]:p-0" {...clean(props)} />,
  a: (props) => {
    const { href = '', ...rest } = clean(props);
    return href.startsWith('/') ? (
      <Link href={href} className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2 hover:decoration-current" {...rest} />
    ) : (
      <a href={href} target="_blank" rel="noopener" className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2" {...rest} />
    );
  },
};

/** Markdown with inline code and $math$, as a block of paragraphs. */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 text-ink-soft ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

const inline: Components = { ...components, p: ({ children }) => <>{children}</> };

/** One line of Markdown (a constraint, a hint) without a paragraph around it. */
export function InlineMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={inline}>
      {text}
    </ReactMarkdown>
  );
}
