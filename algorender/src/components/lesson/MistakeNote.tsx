'use client';

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
        ? 'You made this mistake before and have answered it right once since. One more right answer in your review clears it.'
        : 'You made this mistake in a question here. It comes back in your daily review until you’ve answered it right twice.';
  return (
    <div data-mistake={m.status} className="mt-3 border-t border-warn-line pt-2 text-sm text-ink-soft">
      {text}
    </div>
  );
}
