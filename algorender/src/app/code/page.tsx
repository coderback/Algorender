import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowRight } from 'react-icons/fi';
import { exercises } from '@/content/exercises';

export const metadata: Metadata = {
  title: 'Code it yourself | Algorender',
  description:
    'Write the classic algorithms in Python, JavaScript or TypeScript, right in your browser, and watch your own code drive the visualiser step by step.',
};

export default function CodeIndex() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">Code</div>
      <h1 className="text-3xl font-bold text-ink">Code it yourself</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        Write the algorithm in Python, JavaScript or TypeScript. Your code runs in your browser, and every comparison,
        swap and write it makes plays back on the same visualiser as the built-in version, next to your own lines.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {exercises.map((e) => (
          <li key={e.slug}>
            <Link
              href={`/code/${e.slug}`}
              className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-5 shadow-xs hover:border-accent-line"
            >
              <h2 className="font-semibold text-ink group-hover:text-accent-ink">{e.title}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-soft">{e.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm text-accent-ink">
                Start <FiArrowRight aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
