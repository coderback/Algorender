import { Fragment } from 'react';

/** Exercise text with `code` spans in backticks. */
export function InlineText({ text }: { text: string }) {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.9em] text-ink">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
