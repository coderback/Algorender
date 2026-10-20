'use client';

import { motion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { FiPlay, FiRotateCcw } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { MARKS, NEUTRAL } from '@/viz/marks';
import type { Demo } from './demo';

/**
 * The hero's bubble sort: a few real frames to step through, pausing at each
 * comparison to ask the visitor what happens next, as Predict mode does.
 */
export function HeroDemo({ demo }: { demo: Demo }) {
  const { frames, start } = demo;
  const [at, setAt] = useState(start);
  const [answered, setAnswered] = useState<{ at: number; right: boolean } | null>(null);
  const [score, setScore] = useState({ right: 0, asked: 0 });
  const frame = frames[at];
  const max = Math.max(...frame.bars.map((b) => b.value));
  const pending = frame.checkpoint && answered?.at !== at;
  const last = at === frames.length - 1;

  const answer = (choice: number) => {
    const right = choice === frame.checkpoint!.answer;
    setAnswered({ at, right });
    setScore((s) => ({ right: s.right + (right ? 1 : 0), asked: s.asked + 1 }));
    setAt(at + 1);
  };
  const step = () => {
    if (last) {
      setAt(start);
      setAnswered(null);
      setScore({ right: 0, asked: 0 });
    } else setAt(at + 1);
  };

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}>
      <div role="group" aria-label="Try bubble sort: predict each step" className="relative min-w-0 pb-10 pl-0 sm:min-h-[460px] sm:pl-10">
        <div aria-hidden className="absolute inset-0 bottom-10 left-6 rounded-[40px] bg-track-peach sm:left-10" />
        <div className="relative mt-9 mr-3 flex flex-col gap-[18px] rounded-card bg-surface p-5 shadow-float sm:mr-6 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold tracking-[0.08em] text-track-peach-ink uppercase">Sorting</span>
              <span className="font-display text-2xl font-bold">Bubble sort</span>
            </div>
            <span className="rounded-lg bg-sunken px-2.5 py-1 font-mono text-[13px] tabular-nums">
              step {at + 1} / {frames.length}
            </span>
          </div>
          <ol aria-label="The array" className="flex h-[200px] items-end justify-center gap-1.5 pt-2.5 sm:gap-2.5">
            {frame.bars.map((b) => {
              const style = b.mark ? MARKS[b.mark] : null;
              return (
                <motion.li
                  key={b.id}
                  layout
                  aria-label={style ? `${b.value}, ${style.label.toLowerCase()}` : String(b.value)}
                  style={{ height: `${Math.round((b.value / max) * 100)}%` }}
                  className={cx(
                    'flex w-9 min-h-10 items-end justify-center rounded-[12px] pb-1.5 font-mono font-semibold sm:w-11',
                    style ? style.bg : NEUTRAL.bg,
                    b.mark === 'compare' ? 'text-white' : b.mark ? 'text-on-mark' : 'text-ink',
                  )}
                >
                  {b.value}
                </motion.li>
              );
            })}
          </ol>
          <div className="flex items-center gap-3 rounded-full bg-sunken py-1.5 pr-1.5 pl-[18px]">
            <p aria-live="polite" className="min-w-0 flex-1 text-sm text-ink-soft">
              {frame.note}
            </p>
            <button
              type="button"
              onClick={step}
              disabled={pending}
              aria-label={last ? 'Start again' : 'Next step'}
              title={pending ? 'Answer the question first' : undefined}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors duration-150 ease-standard hover:bg-accent-strong disabled:opacity-45"
            >
              {last ? <FiRotateCcw aria-hidden /> : <FiPlay aria-hidden className="translate-x-px" />}
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 flex w-[250px] flex-col gap-2.5 rounded-tile bg-track-lilac p-4 text-track-lilac-ink shadow-float">
          <span className="text-xs font-semibold tracking-[0.06em] uppercase">Predict</span>
          {pending ? (
            <>
              <p className="text-[15px] leading-snug font-semibold text-track-lilac-title">{frame.checkpoint!.question}</p>
              <div className="flex gap-2">
                {frame.checkpoint!.choices.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => answer(i)}
                    className="flex-1 rounded-full bg-surface px-2 py-2 text-[13px] font-semibold text-ink transition-colors duration-150 ease-standard hover:bg-surface/70"
                  >
                    {c.split(':')[0]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[15px] leading-snug font-semibold text-track-lilac-title" role="status">
              {answered ? (answered.right ? 'Right. ' : 'Not quite. ') : ''}
              {score.asked > 0 ? `${score.right} of ${score.asked} so far.` : 'Step on to the next comparison.'}
            </p>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
