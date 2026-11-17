import { FiArrowRight } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { diffRows, firstColumn } from '../diff';

/**
 * Expected output beside the learner's, line by line, with whitespace made
 * visible (· a space, → a tab, ⏎ a line's end) and the first line that
 * differs marked, with the place it starts to differ underlined. A table,
 * so a screen reader reads it row by row; the visible marks are in the text.
 */
export function OutputDiff({ expected, got, caption = 'Expected output and yours, line by line' }: { expected: string; got: string; caption?: string }) {
  const { rows, first } = diffRows(expected, got);
  if (rows.length === 0) return <p className="text-sm text-ink-muted">Both are empty.</p>;
  return (
    <div className="overflow-x-auto rounded-well bg-sunken">
      <table className="w-full border-collapse font-mono text-[13px] leading-relaxed" data-output-diff>
        <caption className="sr-only">
          {caption}. Spaces show as ·, tabs as →, and the end of a line as ⏎.
          {first !== null && ` Line ${first + 1} is the first that differs.`}
        </caption>
        <thead>
          <tr className="text-left font-sans text-xs text-ink-muted">
            <th scope="col" className="w-12 px-3 py-2 font-semibold">
              Line
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Expected
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Yours
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, k) => {
            const isFirst = k === first;
            const col = isFirst ? firstColumn(row.expected, row.got) : null;
            return (
              <tr key={row.n} data-first={isFirst || undefined} className={cx('align-top', isFirst ? 'bg-bad-soft' : !row.same && 'bg-warn-soft')}>
                <th scope="row" className={cx('px-3 py-1 text-right font-normal', isFirst ? 'text-bad-ink' : 'text-ink-muted')}>
                  {isFirst ? (
                    <span className="inline-flex items-center gap-1">
                      <FiArrowRight aria-hidden className="size-3" />
                      {row.n}
                    </span>
                  ) : (
                    row.n
                  )}
                </th>
                <td className="px-3 py-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">{row.expected ?? <Missing />}</td>
                <td className="px-3 py-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">{row.got === null ? <Missing /> : <Marked text={row.got} at={col} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Missing() {
  return <span className="font-sans text-xs text-ink-muted italic">(no line)</span>;
}

/** A line with the character where it starts to differ underlined. */
function Marked({ text, at }: { text: string; at: number | null }) {
  if (at === null) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="underline decoration-bad-ink decoration-2 underline-offset-4">{text.slice(at, at + 1) || ' '}</span>
      {text.slice(at + 1)}
    </>
  );
}
