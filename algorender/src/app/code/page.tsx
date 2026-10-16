import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowRight } from 'react-icons/fi';
import { exercises } from '@/content/exercises';

export const metadata: Metadata = {
  title: 'Code it yourself | Algorender',
  description:
    'Write the classic algorithms in Python, JavaScript or TypeScript, right in your browser, and watch your own code drive the visualiser step by step.',
};

const GROUPS = [
  { kind: 'write', title: 'Write it', blurb: 'Put the lines in order, fill the gaps, then write the whole algorithm.' },
  { kind: 'modify', title: 'Change it', blurb: 'Start from working code and make it do something new.' },
  { kind: 'bug', title: 'Find the bug', blurb: 'The code is almost right. Run it, watch where it goes wrong, and fix it.' },
] as const;

export default function CodeIndex() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">Code</div>
      <h1 className="text-3xl font-bold text-ink">Code it yourself</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        Write the algorithm in Python, JavaScript or TypeScript. Your code runs in your browser, and what it does plays
        back on the same visualiser as the built-in version, next to your own lines: every comparison, swap and write on
        an array, and every queue, stack and node of a graph or tree it explores.
      </p>
      {GROUPS.map((g) => {
        const items = exercises.filter((e) => e.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <section key={g.kind} aria-labelledby={`group-${g.kind}`} className="mt-8">
            <h2 id={`group-${g.kind}`} className="text-xl font-semibold text-ink">
              {g.title}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">{g.blurb}</p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {items.map((e) => (
                <li key={e.slug}>
                  <Link
                    href={`/code/${e.slug}`}
                    className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-5 shadow-xs hover:border-accent-line"
                  >
                    <h3 className="font-semibold text-ink group-hover:text-accent-ink">{e.title}</h3>
                    <p className="mt-1 flex-1 text-sm text-ink-soft">{e.summary}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm text-accent-ink">
                      Start <FiArrowRight aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
