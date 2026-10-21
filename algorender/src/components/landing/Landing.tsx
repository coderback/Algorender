import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FiArrowRight, FiCheck, FiPlay } from 'react-icons/fi';
import { ButtonLink } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import type { LandingData } from './data';
import { HeroDemo } from './HeroDemo';

// The front door for a first-time visitor (decision D1): what Algorender is,
// counted from content, with two ways in: the onboarding at /start, or a
// visualiser straight away.

const NAV = [
  { href: '/explore', label: 'Visualisers' },
  { href: '/learn?tab=lessons', label: 'Lessons' },
  { href: '/practice', label: 'Practice' },
  { href: '/design', label: 'System design' },
  { href: '/play', label: 'Play' },
] as const;

/** The visualiser "Try one now" opens: the one the hero demo comes from. */
const TRY_ONE = '/visualisers/bubble-sort';

const H2 = 'font-display text-[clamp(34px,4vw,52px)] leading-[1.02] font-bold tracking-[-0.03em] text-balance';

export function Landing({ data }: { data: LandingData }) {
  const { stats } = data;
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-[12px]">
          <span className="flex size-10 items-center justify-center rounded-[12px] bg-logo-tile">
            <Image src="/logo.svg" alt="" width={28} height={28} className="size-7 object-contain" priority />
          </span>
          <span className="font-display text-2xl font-bold tracking-[-0.02em]">Algorender</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2.5 text-[15px] font-medium text-ink-soft transition-colors duration-150 ease-standard hover:bg-surface hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/account" className="hidden h-11 items-center rounded-full px-[18px] text-[15px] font-semibold text-ink hover:bg-surface sm:inline-flex">
            Sign in
          </Link>
          <ButtonLink href="/start">Start learning</ButtonLink>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 pt-6 pb-14 sm:px-6 sm:pt-10">
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-surface py-1.5 pr-3.5 pl-1.5 text-[13px] font-medium text-ink-soft">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-ink">New</span>
              Predict mode: guess the next step, then check
            </span>
            <h1 className="font-display text-[clamp(48px,7vw,88px)] leading-[0.95] font-bold tracking-[-0.04em] text-balance">Watch algorithms think.</h1>
            <p className="max-w-[540px] text-[17px] leading-[1.55] text-pretty text-ink-soft sm:text-[19px]">
              Step through sorting, graphs, trees, dynamic programming and machine learning, forwards and backwards, with the code and the reason for every move. Then predict the next step
              yourself.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/start" size="l" className="text-base" trailing={<FiArrowRight aria-hidden />}>
                Start learning, free
              </ButtonLink>
              <ButtonLink href={TRY_ONE} kind="onTrack" size="l" className="text-base" icon={<FiPlay aria-hidden className="fill-current" />}>
                Try one now, no account
              </ButtonLink>
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_520px]">
            <HeroDemo demo={data.demo} />
          </div>
        </section>

        <section aria-label="What’s inside" className="mx-auto max-w-[1240px] px-4 pb-18 sm:px-6">
          <dl className="grid grid-cols-2 gap-6 rounded-[28px] bg-surface p-6 sm:p-7 lg:grid-cols-4">
            <Stat value={stats.visualisers} label="step-through visualisers" />
            <Stat value={stats.lessons} label="hands-on lessons" />
            <Stat value={stats.problems} label="interview problems with real tests" />
            <Stat
              value={`${stats.browser.length + stats.server.length} languages`}
              label={`${list(stats.browser)} in your browser; ${list(stats.server)} on our server`}
              className="col-span-2 lg:col-span-1"
            />
          </dl>
        </section>

        <section aria-labelledby="how-title" className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 pb-22 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="how-title" className={cx(H2, 'max-w-[640px]')}>
              Watching is the start. Predicting is where it sticks.
            </h2>
            <p className="max-w-[400px] leading-[1.55] text-ink-soft">Every lesson moves you from seeing an idea, to calling its next move, to writing it yourself.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Step colour="lilac" n="01 · Watch" title="See every step, and why" body="Synced pseudo-code, live variables and plain-English narration. Scrub back to any moment.">
              <div className="flex items-center justify-center gap-2 font-mono font-semibold">
                {[1, 4, 7, 9, 12].map((v) => (
                  <span
                    key={v}
                    className={cx(
                      'flex size-[34px] items-center justify-center rounded-[12px]',
                      v === 7 ? 'bg-mark-focus text-on-mark outline-3 outline-offset-3 outline-track-lilac-title' : v > 7 ? 'bg-surface/45 text-track-lilac-ink' : 'bg-surface text-ink',
                    )}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </Step>
            <Step colour="peach" n="02 · Predict" title="Call the next move" body="The player pauses at each decision and asks what happens next. Your answers feed your mastery.">
              <div className="flex flex-col gap-2">
                <span className="rounded-[16px] bg-surface px-3.5 py-3 text-sm font-semibold text-ink">Where does mid land next?</span>
                <div className="flex gap-2 text-[13px] font-semibold">
                  <span className="flex-1 rounded-full bg-primary p-2.5 text-center text-on-primary">Index 2</span>
                  <span className="flex-1 rounded-full bg-surface/60 p-2.5 text-center text-ink">Index 5</span>
                </div>
                <span className="self-start rounded-full bg-good-soft px-3 py-1 text-[13px] font-semibold text-good-ink">Right: 4 of 4 so far</span>
              </div>
            </Step>
            <Step colour="mint" n="03 · Code it" title="Write it, watch your code run" body="Your code drives the same visualiser. When a test fails, you see exactly where it goes wrong.">
              <pre className="flex h-full flex-col justify-center overflow-x-auto rounded-well bg-code px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-code-ink">
                <span>
                  <span className="text-code-keyword">def</span> <span className="text-code-fn">binary_search</span>(a, t):
                </span>
                <span>{'  '}lo, hi = 0, len(a) - 1</span>
                <span className="rounded bg-code-highlight">
                  {'  '}
                  <span className="text-code-keyword">while</span> lo &lt;= hi:
                </span>
                <span>{'    '}mid = (lo + hi) // 2</span>
              </pre>
            </Step>
          </div>
        </section>

        <section aria-labelledby="topics-title" className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 pb-22 sm:px-6">
          <h2 id="topics-title" className={H2}>
            From Big-O to Raft
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.topics.map((t) => {
              const c = TRACK_CLASSES[t.colour];
              return (
                <li key={t.key}>
                  <Link
                    href={t.href}
                    className={cx('flex h-full flex-col gap-7 rounded-[28px] p-6 transition-transform duration-150 ease-standard hover:-translate-y-0.5', c.bg, c.ink)}
                  >
                    <span className="text-[13px] font-semibold">{t.line}</span>
                    <span className={cx('font-display text-[28px] leading-[1.1] font-bold tracking-[-0.02em]', c.title)}>{t.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="plan-title" className="mx-auto max-w-[1240px] px-4 pb-22 sm:px-6">
          <div className="flex flex-wrap items-center gap-12 rounded-[40px] bg-surface p-[clamp(24px,4vw,56px)]">
            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-[18px]">
              <h2 id="plan-title" className={H2}>
                A plan that skips what you know. Reviews that stop you forgetting.
              </h2>
              <p className="text-[17px] leading-[1.6] text-ink-soft">
                Pick a goal and the hours you have. A five-minute placement check drops what you already know, and your plan re-orders itself as you learn. Problems and quiz questions come back
                just before you’d forget them.
              </p>
              <ul className="flex flex-col gap-2.5 text-[15px]">
                <Tick>Goals for {list(data.goals.map(lowerFirst), 'or')}</Tick>
                <Tick>Works offline once a page has loaded</Tick>
                <Tick>Progress syncs when you sign in</Tick>
              </ul>
            </div>
            {/* A picture of Today's review and plan cards; the numbers are an example. */}
            <div aria-hidden className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
              <div className="flex items-center justify-between gap-3 rounded-tile bg-track-butter p-5 text-track-butter-title">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold text-track-butter-ink">Review today</span>
                  <span className="font-display text-[34px] leading-none font-bold">12 cards</span>
                </div>
                <span className="rounded-full bg-primary px-[18px] py-3 text-sm font-semibold text-on-primary">About 6 min</span>
              </div>
              <div className="flex flex-col gap-3 rounded-tile bg-sunken p-5">
                <span className="text-[13px] font-semibold text-ink-muted">This week · {data.week.goal}</span>
                {data.week.items.map((item, i) => (
                  <div key={item.title} className="flex items-center gap-3">
                    <span
                      className={cx(
                        'flex size-7 shrink-0 items-center justify-center rounded-full',
                        i === 0 ? 'bg-accent text-on-accent' : i === 1 ? 'border-2 border-accent' : 'border-2 border-dashed border-ink-faint',
                      )}
                    >
                      {i === 0 && <FiCheck strokeWidth={3} className="size-3.5" />}
                    </span>
                    <span className={cx('flex-1 text-[15px] font-medium', i === 2 && 'text-ink-soft')}>{item.title}</span>
                    <span className="text-[13px] text-ink-muted">{item.minutes} min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-title" className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-7 rounded-[40px] bg-cta p-[clamp(28px,5vw,72px)] text-on-feature">
            <h2 id="cta-title" className="max-w-[680px] font-display text-[clamp(34px,4.5vw,60px)] leading-none font-bold tracking-[-0.035em] text-balance">
              Twenty guesses for a million names. Want to see how?
            </h2>
            <ButtonLink href="/start" kind="onFeature" size="l" className="h-14 px-7 text-[17px]" trailing={<FiArrowRight aria-hidden />}>
              Start learning, free
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 px-4 pb-10 text-sm text-ink-muted sm:px-6">
        <span>
          Algorender ·{' '}
          <a href="https://github.com/coderback/Algorender" className="text-ink-soft underline underline-offset-2 hover:text-ink">
            open source on GitHub
          </a>
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-ink-soft underline underline-offset-2 hover:text-ink">
              {n.label}
            </Link>
          ))}
          <Link href="/embed" className="text-ink-soft underline underline-offset-2 hover:text-ink">
            Embed a visualiser
          </Link>
        </nav>
      </footer>
    </div>
  );
}

/** "a, b and c" (or "a, b or c"). */
function list(items: readonly string[], and = 'and') {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;
}

/** Goal titles start a sentence; mid-sentence they lose the capital, unless it is an acronym. */
const lowerFirst = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));

function Stat({ value, label, className }: { value: ReactNode; label: string; className?: string }) {
  return (
    <div className={cx('flex flex-col-reverse justify-end gap-1', className)}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-display text-[clamp(36px,4vw,48px)] leading-none font-bold tracking-[-0.03em]">{value}</dd>
    </div>
  );
}

function Step({ colour, n, title, body, children }: { colour: TrackColour; n: string; title: string; body: string; children: ReactNode }) {
  const c = TRACK_CLASSES[colour];
  return (
    <article className={cx('flex min-h-[340px] flex-col gap-5 rounded-card p-7', c.bg, c.ink)}>
      <span className="font-mono text-sm">{n}</span>
      <div aria-hidden className="flex flex-1 flex-col justify-center">
        {children}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className={cx('font-display text-[26px] leading-tight font-bold', c.title)}>{title}</h3>
        <p className="text-[15px] leading-[1.55]">{body}</p>
      </div>
    </article>
  );
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <FiCheck aria-hidden strokeWidth={2.5} className="size-4 shrink-0 text-accent-ink" />
      {children}
    </li>
  );
}
