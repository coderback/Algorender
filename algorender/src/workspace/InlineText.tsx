import { Fragment } from 'react';

/** Text with **bold** runs (outside code spans). */
function Bold({ text }: { text: string }) {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-ink">{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** Exercise text with `code` spans in backticks and **bold** runs. */
export function InlineText({ text }: { text: string }) {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.9em] text-ink">
        {part}
      </code>
    ) : (
      <Bold key={i} text={part} />
    ),
  );
}
