import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FiArrowRight, FiChevronRight, FiHome, FiBookOpen, FiPlay, FiRefreshCw, FiShare2 } from 'react-icons/fi';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Card, FeatureCard, TrackCard, TrackCardLink, trackTitle } from '@/components/ui/Card';
import { Chip, DifficultyChip, MonoTag, StatusChip, type Status } from '@/components/ui/Chip';
import { CodeBlock, Kbd } from '@/components/ui/CodeBlock';
import { BigNumber, CountTile } from '@/components/ui/Numbers';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { loadConcepts } from '@/content/concepts';
import { TRACK_COLOURS, type TrackColour } from '@/data/tracks';
import { MARKS, type MarkKey } from '@/viz/marks';
import { FieldsDemo, InputsDemo, SheetDemo } from './Interactive';

// A development sheet for the design system: every primitive in the current
// theme, to check against docs/redesign/renders/system/Main.jpg. It is not
// linked, not in the sitemap and not indexed.
export const metadata: Metadata = {
  title: 'UI foundations · Algorender',
  robots: { index: false, follow: false },
};

const COLOURS: readonly TrackColour[] = ['lilac', 'peach', 'mint', 'sky', 'butter', 'rose', 'teal'];

const PLANES = [
  { name: 'Paper', token: 'page', className: 'bg-page text-ink ring-1 ring-line ring-inset' },
  { name: 'Card', token: 'surface', className: 'bg-surface text-ink ring-1 ring-line ring-inset' },
  { name: 'Sunken', token: 'sunken', className: 'bg-sunken text-ink ring-1 ring-line ring-inset' },
  { name: 'Primary', token: 'primary', className: 'bg-primary text-on-primary' },
  { name: 'Feature', token: 'feature', className: 'bg-feature text-on-feature' },
  { name: 'Violet', token: 'accent', className: 'bg-accent text-on-accent' },
];

const SHEET_MARKS: readonly MarkKey[] = ['compare', 'swap', 'write', 'key', 'frontier', 'sorted'];
const STATUSES: readonly Status[] = ['mastered', 'practised', 'learning', 'ready', 'placed', 'locked'];

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h3 className="text-eyebrow text-ink-muted uppercase">{title}</h3>
      {children}
    </Card>
  );
}

export default function DevUiPage() {
  const { tracks } = loadConcepts();
  const tracksOf = (c: TrackColour) =>
    tracks
      .filter((t) => (TRACK_COLOURS as Record<string, TrackColour>)[t.id] === c)
      .map((t) => t.title)
      .join(' · ');

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-12 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG mark */}
            <img src="/logo.svg" alt="" width={36} height={36} className="rounded-[10px]" />
            <span className="font-display text-2xl font-bold tracking-tight">Algorender</span>
          </div>
          <h1 className="font-display text-title-page">Pastel studio. A calm place to watch ideas move.</h1>
          <p className="text-base leading-relaxed text-ink-soft">
            Warm paper ground, one ink, one violet for action, and a soft pastel per track. Every primitive below is built from the theme tokens; switch the theme to check the other half.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <ThemeToggle />
          <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1.5 text-xs">
            <dt className="text-ink-muted">Display</dt>
            <dd className="font-display font-semibold">Bricolage Grotesque</dd>
            <dt className="text-ink-muted">Text</dt>
            <dd className="font-semibold">Geist</dd>
            <dt className="text-ink-muted">Code</dt>
            <dd className="font-mono font-semibold">Geist Mono</dd>
            <dt className="text-ink-muted">Icons</dt>
            <dd className="font-semibold">Feather</dd>
          </dl>
        </div>
      </header>

      <section aria-labelledby="colour" className="flex flex-col gap-5">
        <h2 id="colour" className="font-display text-title-section">
          Colour <span className="ml-2 font-sans text-xs font-normal tracking-normal text-ink-muted">Every text pairing clears 4.5:1</span>
        </h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {PLANES.map((p) => (
            <li key={p.token} className={`flex min-h-28 flex-col justify-end rounded-tile p-3.5 ${p.className}`}>
              <span className="text-[13px] font-semibold">{p.name}</span>
              <span className="font-mono text-[11px]">{p.token}</span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] font-semibold">Track pastels: one per area of the concept map</p>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {COLOURS.map((c) => (
            <li key={c}>
              <TrackCard as="div" track={c} dense className="min-h-36 justify-between rounded-tile">
                <span className="font-mono text-[11px]">track-{c}</span>
                <span>
                  <span className={`block font-display text-xl font-bold capitalize ${trackTitle(c)}`}>{c}</span>
                  <span className="text-xs">{tracksOf(c)}</span>
                </span>
              </TrackCard>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title="Feedback">
            <div className="flex flex-wrap gap-2">
              <Chip tone="good">Correct</Chip>
              <Chip tone="warn">Careful</Chip>
              <Chip tone="bad">Wrong</Chip>
            </div>
            <Alert tone="good" role={null} title="Right: 21 is the middle">
              Everything left of it is smaller, so the target can only be on the right.
            </Alert>
            <Alert tone="warn" role={null} title="Partly">
              You named the halving but not why the list must be sorted.
            </Alert>
            <Alert tone="bad" role={null} title="Not quite">
              That swap breaks the order the inner loop relies on.
            </Alert>
          </Panel>
          <Panel title="Visualiser marks (unchanged: Okabe–Ito, each with a glyph)">
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SHEET_MARKS.map((k) => {
                const m = MARKS[k];
                return (
                  <li key={k} className="flex flex-col gap-1.5">
                    <span className={`flex h-9 items-center justify-center rounded-[10px] text-sm font-semibold ${m.bg} ${k === 'compare' ? 'text-white' : 'text-on-mark'}`}>{m.glyph}</span>
                    <span className="text-xs font-semibold">{m.label}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-end gap-1.5 rounded-well bg-subtle p-4" aria-hidden>
              {[40, 70, 25, 100, 55, 85].map((h, i) => (
                <span key={i} className={`w-6 rounded-t-md ${i === 2 ? MARKS.compare.bg : 'bg-bar'}`} style={{ height: `${h * 0.6}px` }} />
              ))}
            </div>
            <p className="text-[13px] text-ink-muted">Idle bars are a warm lilac grey, so the stage sits in the pastel world while marks still pop.</p>
          </Panel>
        </div>
      </section>

      <section aria-labelledby="type">
        <Card className="gap-0 p-7 md:grid md:grid-cols-[260px_1fr] md:gap-10">
          <div className="mb-6 flex flex-col gap-3 md:mb-0">
            <h2 id="type" className="font-display text-title-section">Type</h2>
            <p className="text-[13px] leading-relaxed text-ink-soft">Bricolage for headings and big numbers. Geist for reading and UI. Geist Mono for code, complexities and values on the stage.</p>
          </div>
          <dl className="flex flex-col divide-y divide-line-soft">
            {[
              ['Page title', <span key="a" className="font-display text-title-page">Halve it until you find it</span>],
              ['Section title', <span key="b" className="font-display text-title-section">This week&apos;s plan</span>],
              ['Card title', <span key="c" className="font-display text-title-card">Merge sort · Divide and conquer</span>],
              ['Big number', <BigNumber key="d" value="12" unit="cards" />],
              ['Body 15', <span key="e" className="text-[15px] leading-relaxed">Every answer throws away half of what is left, so a million names take about twenty guesses. The catch is the word sorted.</span>],
              ['Eyebrow', <span key="f" className="text-eyebrow text-accent-ink uppercase">Searching &amp; sorting</span>],
              ['Mono 14', <span key="g" className="font-mono text-sm">if A[j] &gt; A[j+1] then swap · O(n log n) · 12,480</span>],
            ].map(([role, sample]) => (
              <div key={role as string} className="grid gap-2 py-4 sm:grid-cols-[110px_1fr] sm:items-baseline">
                <dt className="text-xs text-ink-muted">{role}</dt>
                <dd className="min-w-0">{sample}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section aria-labelledby="components" className="flex flex-col gap-5">
        <h2 id="components" className="font-display text-title-section">Components</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Panel title="Buttons">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button kind="primary" trailing={<FiArrowRight aria-hidden />}>Continue</Button>
              <Button kind="accent">Start lesson</Button>
              <Button kind="secondary">Code it</Button>
              <Button kind="soft">Visualiser</Button>
              <Button kind="ghost">Skip</Button>
              <Button kind="danger">Delete account</Button>
              <IconButton label="Play" kind="accent" size="l">
                <FiPlay aria-hidden />
              </IconButton>
              <IconButton label="Step forward" kind="soft">
                <FiChevronRight aria-hidden />
              </IconButton>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button kind="primary" size="s">Small</Button>
              <Button kind="primary" size="l">Large</Button>
              <Button kind="accent" disabled>Disabled</Button>
              <ButtonLink href="/dev/ui" kind="secondary" size="s">A link</ButtonLink>
            </div>
            <p className="text-[13px] text-ink-muted">Ink pill = the one main action on a screen. Violet = learning actions. All targets are 36px or more.</p>
          </Panel>

          <Panel title="Status & difficulty chips">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <StatusChip key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <DifficultyChip level="easy" />
              <DifficultyChip level="medium" />
              <DifficultyChip level="hard" />
              <MonoTag>O(log n)</MonoTag>
              <Chip>Hashing</Chip>
            </div>
            <p className="text-[13px] text-ink-muted">Statuses are the progress model&apos;s six, always with a word. Status = round pill; difficulty and complexity = square tag.</p>
          </Panel>

          <Panel title="Inputs & switches">
            <InputsDemo />
          </Panel>

          <Panel title="Topic tile">
            <TrackCardLink href="/visualisers/merge-sort" track="searching-sorting" className="min-h-44 justify-between rounded-tile p-5">
              <span className="flex items-start justify-between">
                <Chip tone="onTrack">Sorting</Chip>
                <span className="font-mono text-xs">O(n log n)</span>
              </span>
              <span>
                <span className={`block font-display text-title-card ${trackTitle('searching-sorting')}`}>Merge sort</span>
                <span className="text-[13px]">Split, sort halves, merge back</span>
              </span>
            </TrackCardLink>
          </Panel>

          <Panel title="Rail item">
            <div className="flex justify-center gap-2.5 rounded-[28px] bg-rail p-3.5">
              <span className="flex h-15 w-[68px] flex-col items-center justify-center gap-1 rounded-[18px] bg-rail-active text-[11px] font-semibold text-on-rail-active">
                <FiHome aria-hidden className="size-5" />
                Today
              </span>
              <span className="flex h-15 w-[68px] flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-medium text-rail-ink">
                <FiBookOpen aria-hidden className="size-5" />
                Learn
              </span>
              <span className="relative flex h-15 w-[68px] flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-medium text-rail-ink">
                <FiRefreshCw aria-hidden className="size-5" />
                Review
                <span className="absolute top-1.5 right-3 flex size-[18px] items-center justify-center rounded-full bg-badge text-[10px] font-bold text-on-badge">12</span>
              </span>
            </div>
            <p className="text-[13px] text-ink-muted">Icon plus a short label, always. Active = a light tile on the ink rail. Counts sit on the icon.</p>
          </Panel>

          <Panel title="Shape & depth">
            <div className="flex items-end gap-3">
              {[
                ['rounded-[10px]', '10 tag'],
                ['rounded-well', '18 well'],
                ['rounded-tile', '24 tile'],
                ['rounded-card', '32 card'],
              ].map(([r, l]) => (
                <div key={l} className="flex flex-col items-center gap-1.5">
                  <span className={`size-14 bg-accent-soft ${r}`} />
                  <span className="text-xs text-ink-muted">{l}</span>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-ink-muted">Cards on paper need no border: the surface does the work. No card shadows.</p>
          </Panel>
        </div>
      </section>

      <section aria-labelledby="blocks" className="flex flex-col gap-5">
        <h2 id="blocks" className="font-display text-title-section">Building blocks</h2>
        <SectionTabs
          active="/dev/ui"
          tabs={[
            { href: '/dev/ui', label: 'Problems', count: 91 },
            { href: '/dev/ui?code', label: 'Code it', count: 24 },
            { href: '/dev/ui?drills', label: 'Pattern drills' },
            { href: '/dev/ui?design', label: 'System design', count: 5 },
          ]}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <h3 className="font-display text-title-card">A card</h3>
            <p className="text-[15px] text-ink-soft">White on paper, 32px corners, no border and no shadow.</p>
            <div className="grid grid-cols-3 gap-2">
              <CountTile value={14} label="Comparisons" track="lilac" />
              <CountTile value={6} label="Swaps" track="peach" />
              <CountTile value={2} label="Pass" />
            </div>
          </Card>
          <TrackCard track="patterns">
            <span className="text-eyebrow uppercase">Review due</span>
            <BigNumber value="12" unit="cards" className={trackTitle('patterns')} />
            <Button kind="primary" block>Start review</Button>
          </TrackCard>
          <FeatureCard>
            <span className="text-eyebrow text-feature-muted uppercase">Problem for today</span>
            <h3 className="font-display text-title-card">Spot a Repeated Number</h3>
            <div className="flex flex-wrap gap-2">
              <DifficultyChip level="easy" />
              <Chip tone="onFeature">Hashing</Chip>
            </div>
            <Button kind="onFeature" block trailing={<FiArrowRight aria-hidden />}>Solve it</Button>
          </FeatureCard>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Fields">
            <FieldsDemo />
          </Panel>
          <Panel title="Code block & keys">
            <CodeBlock
              label="Bubble sort, line 3 current"
              current={3}
              lines={['for i from 0 to n − 1', '  for j from 0 to n − i − 2', '    if A[j] > A[j+1] then swap(A[j], A[j+1])', '  stop early if no swaps happened']}
            />
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <Kbd>←</Kbd> <Kbd>→</Kbd> step · <Kbd>Space</Kbd> play · <Kbd>Home</Kbd>/<Kbd>End</Kbd> jump
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SheetDemo />
              <IconButton label="Share" kind="soft" size="s">
                <FiShare2 aria-hidden />
              </IconButton>
            </div>
          </Panel>
        </div>
      </section>
    </main>
  );
}
