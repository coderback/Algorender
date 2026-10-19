import { clsx } from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Code on the dark code panel: optional line numbers and one highlighted
 * line. Long lines wrap rather than overflow the card.
 */
export function CodeBlock({
  lines,
  current,
  numbers = true,
  label,
  className,
}: {
  lines: readonly ReactNode[];
  /** 1-based line to highlight. */
  current?: number;
  numbers?: boolean;
  /** Accessible name for the block. */
  label?: string;
  className?: string;
}) {
  return (
    <pre aria-label={label} className={clsx('overflow-hidden rounded-well bg-code p-5 font-mono text-[13px] leading-relaxed text-code-ink', className)}>
      <code className="flex flex-col">
        {lines.map((line, i) => {
          const on = current === i + 1;
          return (
            <span
              key={i}
              aria-current={on ? 'step' : undefined}
              className={clsx('flex gap-3 rounded-[10px] px-2', on && 'bg-code-highlight')}
            >
              {numbers && (
                <span aria-hidden className="w-3.5 shrink-0 text-right text-code-muted select-none">
                  {i + 1}
                </span>
              )}
              <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{line}</span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}

/** A keyboard key: ⌘K, Space, 1–4. */
export function Kbd({ className, children, ...rest }: ComponentProps<'kbd'>) {
  return (
    <kbd className={clsx('inline-flex min-w-6 items-center justify-center rounded-lg bg-sunken px-2 py-0.5 font-mono text-xs font-medium text-ink-soft', className)} {...rest}>
      {children}
    </kbd>
  );
}
