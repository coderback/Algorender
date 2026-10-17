'use client';

import { FiCheck } from 'react-icons/fi';
import { segmentLines, type Segment } from '../formats/blanks';

/**
 * Code with gaps to fill. Each level of a faded example hides more of the
 * solution, so the learner writes a little more each time; the gaps are judged
 * by running the tests, so any code that works is right.
 */
export function FillStage({
  segments,
  hidden,
  answers,
  onAnswer,
  levels,
  level,
  onLevel,
  passedLevel,
}: {
  segments: readonly Segment[];
  hidden: ReadonlySet<number>;
  answers: Readonly<Record<number, string>>;
  onAnswer: (n: number, value: string) => void;
  /** Gaps per level, easiest first. */
  levels: readonly number[][];
  level: number;
  onLevel: (level: number) => void;
  /** Highest level passed so far, or -1. */
  passedLevel: number;
}) {
  const lines = segmentLines(segments);
  const order = levels[level];
  const gapNumber = (n: number) => order.indexOf(n) + 1;
  return (
    <div className="space-y-3">
      {levels.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="How much to fill in">
          <span className="text-ink-soft">Gaps:</span>
          {levels.map((gaps, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={level === i}
              onClick={() => onLevel(i)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                level === i ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-soft hover:bg-sunken'
              }`}
            >
              {i <= passedLevel && <FiCheck aria-label="passed" />}
              {gaps.length} {gaps.length === 1 ? 'gap' : 'gaps'}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label="Code with gaps" className="overflow-x-auto rounded-xl border border-line bg-surface py-2 font-mono text-[13.5px] leading-[2]">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-10 shrink-0 pr-3 text-right text-ink-muted select-none" aria-hidden>
              {i + 1}
            </span>
            <span className="whitespace-pre text-ink">
              {line.map((s, k) =>
                s.kind === 'text' || !hidden.has(s.n) ? (
                  <span key={k}>{s.kind === 'text' ? s.text : s.answer}</span>
                ) : (
                  <input
                    key={k}
                    value={answers[s.n] ?? ''}
                    onChange={(e) => onAnswer(s.n, e.target.value)}
                    aria-label={`Gap ${gapNumber(s.n)} of ${order.length}, line ${i + 1}`}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    style={{ width: `${Math.max(4, s.answer.length + 2)}ch` }}
                    className="mx-0.5 rounded border border-dashed border-accent-line bg-accent-soft px-1 font-mono text-ink focus:border-solid focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
                  />
                ),
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
