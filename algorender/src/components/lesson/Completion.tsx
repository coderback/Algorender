'use client';

import { useRouter } from 'next/navigation';
import { FiArrowRight, FiCheckCircle } from 'react-icons/fi';
import { Button, ButtonLink } from '@/components/ui/Button';
import { markComplete, useProgress } from './progress';

/**
 * The end of a lesson: back to the path, and finishing it, which marks it
 * complete and moves on to the next lesson when there is one. A finished
 * lesson can be marked not done again.
 */
export function LessonFinish({ slug, next }: { slug: string; next?: { href: string; title: string } }) {
  const router = useRouter();
  const done = useProgress().completed.includes(slug);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-8">
      <ButtonLink href="/learn" kind="secondary">
        Back to path
      </ButtonLink>
      <div className="flex flex-wrap items-center gap-2">
        {done ? (
          <>
            <Button kind="soft" aria-pressed onClick={() => markComplete(slug, false)} icon={<FiCheckCircle aria-hidden className="text-good-ink" />}>
              Completed
            </Button>
            {next && (
              <ButtonLink href={next.href} trailing={<FiArrowRight aria-hidden />}>
                Next: {next.title}
              </ButtonLink>
            )}
          </>
        ) : (
          <Button
            aria-pressed={false}
            trailing={<FiArrowRight aria-hidden />}
            onClick={() => {
              markComplete(slug, true);
              if (next) router.push(next.href);
            }}
          >
            {next ? `Finish · next: ${next.title}` : 'Finish the lesson'}
          </Button>
        )}
      </div>
    </div>
  );
}
