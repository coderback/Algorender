'use client';

import { FiRotateCw } from 'react-icons/fi';
import { useMistakes, useProgressSnapshot } from '@/progress/hooks';
import { CLEAR_AFTER, misconceptionCard } from '@/progress/misconceptions';
import { useLessonSlug } from './LessonContext';

/** Under a `<Misconception>`: whether the learner has shown this mistake, and how far they are from clearing it. */
export function MistakeNote({ id }: { id: string }) {
  const lesson = useLessonSlug();
  const { ready } = useProgressSnapshot();
  const m = useMistakes().get(misconceptionCard(lesson, id));
  if (!ready || !m) return null;
  const text =
    m.status === 'cleared'
      ? `Cleared: you’ve answered it right ${CLEAR_AFTER} times in a row since you last made it.`
      : m.status === 'clearing'
        ? `You made this mistake before · clearing: right ${m.right} of ${CLEAR_AFTER} times. One more right answer in your review clears it.`
        : `You made this mistake in a question here. It comes back in your daily review until you’ve answered it right ${CLEAR_AFTER} times.`;
  return (
    <p data-mistake={m.status} className="mt-1 inline-flex items-start gap-1.5 self-start rounded-[14px] bg-surface/80 px-3 py-1.5 text-xs font-semibold text-warn-title">
      <FiRotateCw aria-hidden className="mt-0.5 size-3 shrink-0" />
      {text}
    </p>
  );
}
