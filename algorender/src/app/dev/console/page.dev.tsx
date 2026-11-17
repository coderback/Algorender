import type { Metadata } from 'next';
import { ConsoleSpike } from './ConsoleSpike';

// A development page for the language tracks' first step (L0): a program
// with two files, run in the real sandboxed workers through the replay
// console. Only the dev server serves it (the .dev.tsx extension; see
// next.config.mjs); e2e/console.spec.ts drives it there.
export const metadata: Metadata = {
  title: 'Replay console · Algorender',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main id="content" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="font-display text-title-page text-ink">Replay console</h1>
      <p className="text-ink-soft">
        A program reads its input line by line; each answer runs it again from the start with one more line. The main file imports
        the second one.
      </p>
      <ConsoleSpike />
    </main>
  );
}
