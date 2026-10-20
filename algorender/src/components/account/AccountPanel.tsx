'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { FiAward, FiCheck, FiCheckCircle, FiCloud, FiCloudOff, FiCode, FiGithub, FiGlobe, FiHelpCircle, FiLoader, FiMap, FiRefreshCw, FiTarget } from 'react-icons/fi';
import { ConceptBubbles } from '@/components/learn/ConceptBubbles';
import { applyTheme, THEME_LABEL, useTheme, type Theme } from '@/components/ThemeToggle';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, TrackCard, trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import { authClient } from '@/lib/auth-client';
import { useMinute } from '@/lib/now';
import { useMastery, useProblemProgress, useProgressSnapshot } from '@/progress/hooks';
import { KNOWN, type MasteryGraph } from '@/progress/mastery';
import { badges, xpLedger, xpTotals } from '@/progress/play';
import { currentPlan } from '@/progress/plan';
import { progressStore, type SyncStatus } from '@/progress/store';
import type { SocialProvider as Provider } from '@/server/providers';
import { loadLanguage, saveLanguage } from '@/workspace/storage';
import { LANGUAGES, type Language } from '@/workspace/protocol';
import { heatmap, HEATMAP_WEEKS, predictionShare, recent, type HeatDay, type RecentKind } from './activity';

export type AccountData = {
  graph: MasteryGraph;
  titles: { lessons: Record<string, string>; problems: Record<string, string>; goals: Record<string, string>; languages: Record<string, string> };
};

/**
 * Signed out: sign in or create an account (optional; progress is saved on
 * the device first). Signed in: the learner's progress at a glance, recent
 * activity, settings, sync, signing out and deleting the account.
 */
export function AccountPanel({ providers, data }: { providers: Provider[]; data: AccountData }) {
  const session = authClient.useSession();
  if (session.isPending) {
    return (
      <main className="px-4 md:px-0 md:pt-2">
        <p className="flex items-center gap-2 text-ink-soft" role="status">
          <FiLoader aria-hidden className="animate-spin" /> Checking your session…
        </p>
      </main>
    );
  }
  const user = session.data?.user;
  return user ? <Profile name={user.name} email={user.email} createdAt={user.createdAt} data={data} /> : <SignInForms providers={providers} offline={session.error != null} />;
}

/** Where to go once signed in (?next=/practice/two-sum, from a page that needed an account): a path on this site, or null. */
function nextPage(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
}

const BENEFITS = ['Progress follows you to every device', 'Ask the tutor, and have explanations scored', 'Run Java, C++ and Go on our server'];

function SignInForms({ providers, offline }: { providers: Provider[]; offline: boolean }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setBusy(true);
    setError(null);
    const { error: failed } =
      mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name') ?? '').trim() || email.split('@')[0] })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (failed) setError(failed.message ?? 'That didn’t work. Try again.');
    else if (nextPage()) router.push(nextPage()!);
  };

  return (
    <main className="grid grid-cols-1 items-start gap-4 px-4 pb-6 md:px-0 md:pt-2 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <TrackCard track="lilac" as="div" className="gap-6 rounded-[36px] p-6 sm:p-9">
        <span className="hidden items-center gap-2.5 sm:flex">
          <span className="flex size-11 items-center justify-center rounded-[12px] bg-logo-tile">
            <Image src="/logo.svg" alt="" width={30} height={30} className="size-7.5 object-contain" />
          </span>
          <span className={cx('font-display text-[28px] font-bold tracking-[-0.02em]', trackTitle('lilac'))}>Algorender</span>
        </span>
        <ConceptBubbles />
        <p className={cx('font-display text-[clamp(28px,3vw,40px)] leading-[1.05] font-bold tracking-[-0.025em]', trackTitle('lilac'))}>Pick up where you left off, on any device.</p>
        <p className="text-[15px] leading-relaxed sm:text-base">Your progress is saved on this device first. Signing in adds sync, the tutor and server languages.</p>
      </TrackCard>

      <Card className="gap-5 rounded-[36px] p-6 sm:p-9">
        <Segmented
          label="Sign in or create an account"
          size="m"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'sign-in', label: 'Sign in' },
            { value: 'sign-up', label: 'Create an account' },
          ]}
        />
        <h1 className="font-display text-[clamp(32px,3.4vw,40px)] leading-tight font-bold tracking-[-0.025em]">{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h1>
        {offline && (
          <Alert tone="warn" title="You seem to be offline.">
            Your progress is still saved on this device.
          </Alert>
        )}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          {mode === 'sign-up' && <Field label="Name" name="name" autoComplete="name" />}
          <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            placeholder="At least 8 characters"
            required
            minLength={8}
            hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
          />
          {error && (
            <Alert tone="bad" role="alert" title={error}>
              {null}
            </Alert>
          )}
          <Button type="submit" size="l" block disabled={busy} icon={busy ? <FiLoader aria-hidden className="animate-spin" /> : undefined}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        {providers.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-line-soft" />
              or
              <span className="h-px flex-1 bg-line-soft" />
            </div>
            <div className="flex flex-col gap-3">
              {providers.map((p) => (
                <Button
                  key={p}
                  kind="secondary"
                  size="l"
                  block
                  icon={p === 'github' ? <FiGithub aria-hidden /> : <FiGlobe aria-hidden />}
                  onClick={() => void authClient.signIn.social({ provider: p, callbackURL: nextPage() ?? '/account' })}
                >
                  Continue with {p === 'github' ? 'GitHub' : 'Google'}
                </Button>
              ))}
            </div>
          </>
        )}
        <ul className="flex flex-col gap-2.5 border-t border-line-soft pt-5 text-[15px]">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-3">
              <FiCheck aria-hidden strokeWidth={2.5} className="size-4 shrink-0 text-accent-ink" />
              {b}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-ink-muted">Optional. Everything else works without an account, offline too. You go back to where you were after signing in.</p>
      </Card>
    </main>
  );
}

function Profile({ name, email, createdAt, data }: { name: string; email: string; createdAt: Date | string; data: AccountData }) {
  const snapshot = useProgressSnapshot();
  const { events } = snapshot;
  const now = useMinute();
  const m = useMastery(data.graph);
  const problems = useProblemProgress();
  const solved = Object.values(problems).filter((p) => p.solved).length;
  const known = [...m.values()].filter((c) => KNOWN.has(c.status)).length;
  const share = useMemo(() => predictionShare(events), [events]);
  const xp = useMemo(() => (now ? xpTotals(xpLedger(events), now).total : null), [events, now]);
  const badgeCount = useMemo(() => badges(events).size, [events]);
  const plan = useMemo(() => currentPlan(events), [events]);
  const since = new Date(events[0]?.at ?? createdAt);
  const initial = (name.trim() || email)[0]?.toUpperCase() ?? '?';
  const synced = snapshot.sync.state === 'idle';

  const facts = [
    `Learning since ${since.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    plan && `goal: ${(data.titles.goals[plan.goal] ?? plan.goal).toLowerCase()}`,
    synced && 'progress synced',
  ].filter(Boolean);

  return (
    <main className="flex flex-col gap-4 px-4 pb-6 md:px-0 md:pt-2">
      <TrackCard track="lilac" as="section" aria-labelledby="account-name" className="flex-row flex-wrap items-center gap-5 rounded-[36px] p-5 sm:p-7">
        <span aria-hidden className={cx('flex size-20 shrink-0 items-center justify-center rounded-tile bg-surface font-display text-[40px] font-bold sm:size-24', trackTitle('lilac'))}>
          {initial}
        </span>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <h1 id="account-name" className={cx('font-display text-[clamp(32px,3.6vw,48px)] leading-none font-bold tracking-[-0.03em]', trackTitle('lilac'))}>
            {name || 'Your account'}
          </h1>
          <p className="text-[15px]">{facts.join(' · ')}</p>
        </div>
        <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 xl:w-auto xl:flex-[0_1_620px]">
          <Stat value={known} label="Concepts known" href="/learn" />
          <Stat value={solved} label="Problems solved" href="/practice" />
          <Stat value={share === null ? '–' : `${Math.round(share * 100)}%`} label="Predictions right" href="/learn" />
          <Stat value={xp === null ? '–' : xp.toLocaleString()} label={`Mastery XP · ${badgeCount} ${badgeCount === 1 ? 'badge' : 'badges'}`} href="/play" feature />
        </ul>
      </TrackCard>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {now && <Activity events={events} now={now} />}
          <Recently events={events} titles={data.titles} />
        </div>
        <Settings email={email} status={snapshot.sync} />
      </div>
    </main>
  );
}

function Stat({ value, label, href, feature = false }: { value: ReactNode; label: string; href: string; feature?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className={cx(
          'flex h-full flex-col justify-between gap-2 rounded-tile p-4 transition-transform duration-150 ease-standard hover:-translate-y-0.5',
          feature ? 'bg-feature text-on-feature' : 'bg-surface text-ink',
        )}
      >
        <span className="font-display text-number-tile tabular-nums">{value}</span>
        <span className={cx('text-[13px]', feature ? 'text-feature-muted' : 'text-ink-soft')}>{label}</span>
      </Link>
    </li>
  );
}

const SHADE: Record<HeatDay['level'], string> = {
  0: 'bg-sunken',
  1: 'bg-track-lilac',
  2: 'bg-track-lilac-bar/60',
  3: 'bg-accent',
  4: 'bg-track-lilac-ink',
};

function Activity({ events, now }: { events: Parameters<typeof heatmap>[0]; now: Date }) {
  const columns = useMemo(() => heatmap(events, now), [events, now]);
  const active = columns.flat().filter((d) => d.count > 0).length;
  // On a narrow screen the grid scrolls; start at the latest weeks.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <Card aria-labelledby="activity-title" className="gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="activity-title" className="font-display text-title-section">
          Activity
        </h2>
        <span className="text-[13px] text-ink-soft">Last {HEATMAP_WEEKS} weeks · things done a day</span>
      </div>
      <div ref={scroller} tabIndex={0} role="group" aria-label="Activity grid" className="overflow-x-auto rounded-[8px]">
        <div role="img" aria-label={`Active on ${active} ${active === 1 ? 'day' : 'days'} in the last ${HEATMAP_WEEKS} weeks`} className="flex w-fit gap-1.5">
          {columns.map((week) => (
            <div key={week[0].day} className="flex flex-col gap-1.5">
              {week.map((d) => (
                <span
                  key={d.day}
                  title={d.future ? undefined : `${d.day}: ${d.count} ${d.count === 1 ? 'thing' : 'things'} done`}
                  className={cx('size-5 rounded-[6px] sm:size-[22px]', d.future ? 'bg-transparent' : SHADE[d.level])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="flex items-center gap-1.5 text-xs text-ink-muted">
        Less
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={cx('size-3 rounded-[4px]', SHADE[l])} />
        ))}
        More
      </div>
    </Card>
  );
}

const RECENT_LOOK: Record<RecentKind, { icon: typeof FiCode; colour: TrackColour }> = {
  lesson: { icon: FiAward, colour: 'mint' },
  problem: { icon: FiCode, colour: 'mint' },
  prediction: { icon: FiHelpCircle, colour: 'peach' },
  review: { icon: FiRefreshCw, colour: 'butter' },
  placement: { icon: FiTarget, colour: 'lilac' },
  plan: { icon: FiMap, colour: 'sky' },
};

function Recently({ events, titles }: { events: Parameters<typeof recent>[0]; titles: AccountData['titles'] }) {
  const lines = useMemo(() => recent(events, titles), [events, titles]);
  const now = useMinute();
  const when = (day: string) => {
    if (!now) return '';
    const d = new Date(`${day}T12:00`);
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime() - d.getTime()) / 86_400_000);
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  return (
    <Card aria-labelledby="recent-title" className="gap-2 p-6">
      <h2 id="recent-title" className="font-display text-title-section">
        Recently
      </h2>
      {lines.length === 0 ? (
        <p className="py-3 text-[15px] text-ink-soft">Nothing yet. Lessons you finish, problems you solve and cards you review show up here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {lines.map((l) => {
            const look = RECENT_LOOK[l.kind];
            const c = TRACK_CLASSES[look.colour];
            const Icon = look.icon;
            return (
              <li key={`${l.kind}:${l.at}`} className="flex items-center gap-3.5 py-3.5">
                <span aria-hidden className={cx('flex size-10 shrink-0 items-center justify-center rounded-[12px]', c.bg, c.title)}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1 text-[15px]">
                  {l.text}
                  {l.strong && <strong className="font-semibold">{l.strong}</strong>}
                  {l.after}
                </span>
                <span className="shrink-0 text-[13px] text-ink-muted">{when(l.day)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const noop = () => () => {};

function Settings({ email, status }: { email: string; status: SyncStatus }) {
  const { theme } = useTheme();
  const stored = useSyncExternalStore(noop, loadLanguage, () => null);
  const [picked, setPicked] = useState<Language | null>(null);
  const language = picked ?? stored ?? 'python';
  const [leaving, setLeaving] = useState(false);

  const signOut = async () => {
    setLeaving(true);
    await progressStore().signOut();
    await authClient.signOut();
    setLeaving(false);
  };

  return (
    <Card aria-labelledby="settings-title" className="gap-5 p-6">
      <h2 id="settings-title" className="font-display text-title-section">
        Settings
      </h2>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Theme</span>
        <Segmented<Theme>
          label="Theme"
          size="m"
          value={theme}
          onChange={applyTheme}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={(['system', 'light', 'dark'] as const).map((t) => ({ value: t, label: THEME_LABEL[t] }))}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="code-language" className="text-[15px] font-semibold">
          Code language
        </label>
        <select
          id="code-language"
          value={language}
          onChange={(e) => {
            const next = e.target.value as Language;
            setPicked(next);
            saveLanguage(next);
          }}
          className="h-11 cursor-pointer rounded-full bg-sunken pr-3 pl-4 text-[15px] font-semibold text-ink"
        >
          {(Object.keys(LANGUAGES) as Language[]).map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l].label}
            </option>
          ))}
        </select>
      </div>
      {/* TODO(redesign): the board also has a default playback speed and switches for starting visualisers in Predict mode, reducing motion and a daily review reminder; none of these settings exist yet. */}
      <div className="flex flex-col gap-3 border-t border-line-soft pt-5">
        <p className="text-[13px] text-ink-soft">Signed in as {email}. Progress is saved on this device first, so it works offline.</p>
        <div className={cx('flex items-center justify-between gap-3 rounded-well py-2 pr-2 pl-4', status.state === 'idle' ? 'bg-good-soft text-good-title' : status.state === 'error' ? 'bg-bad-soft text-bad-title' : 'bg-sunken text-ink')}>
          <SyncLine status={status} />
          <Button kind="onTrack" size="s" icon={<FiRefreshCw aria-hidden />} onClick={() => void progressStore().syncNow()} disabled={status.state === 'syncing'}>
            Sync now
          </Button>
        </div>
        {/* TODO(redesign): "Export my data" is on the board; there is no export yet. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button kind="ghost" className="text-bad-ink hover:bg-bad-soft" onClick={() => void signOut()} disabled={leaving} icon={leaving ? <FiLoader aria-hidden className="animate-spin" /> : undefined}>
            Sign out
          </Button>
        </div>
        <DeleteAccount />
      </div>
    </Card>
  );
}

function SyncLine({ status }: { status: SyncStatus }) {
  const waiting = status.pending > 0 ? ` ${status.pending} ${status.pending === 1 ? 'change waits' : 'changes wait'} to sync.` : '';
  const line: Record<SyncStatus['state'], [ReactNode, string]> = {
    local: [<FiCloudOff key="i" aria-hidden />, 'Not syncing.'],
    syncing: [<FiLoader key="i" aria-hidden className="animate-spin" />, 'Syncing…'],
    idle: [<FiCheckCircle key="i" aria-hidden />, status.lastSynced ? `Synced ${new Date(status.lastSynced).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.${waiting}` : `Connected.${waiting}`],
    offline: [<FiCloudOff key="i" aria-hidden />, `Offline: everything is saved on this device and syncs when you’re back.${waiting}`],
    error: [<FiCloud key="i" aria-hidden />, `${status.message ?? 'Sync failed.'}${waiting}`],
  };
  const [icon, text] = line[status.state];
  return (
    <p className="flex min-w-0 items-start gap-2 text-sm font-semibold" role="status">
      <span className="mt-0.5 shrink-0">{icon}</span> {text}
    </p>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    setBusy(true);
    setError(null);
    const { error: failed } = await authClient.deleteUser({ password });
    setBusy(false);
    if (failed) {
      setError(failed.message ?? 'The account wasn’t deleted.');
      return;
    }
    await progressStore().setOwner(null, { explicit: true });
  };

  if (!open) {
    return (
      <Button kind="danger" className="self-start" onClick={() => setOpen(true)}>
        Delete account…
      </Button>
    );
  }
  return (
    <form onSubmit={(e) => void remove(e)} className="flex flex-col gap-3 rounded-tile bg-bad-soft p-4" aria-labelledby="delete-title">
      <h3 id="delete-title" className="text-[15px] font-semibold text-bad-title">
        Delete your account
      </h3>
      <p className="text-sm text-bad-ink">This deletes your account and all the progress saved to it, on every device. It can’t be undone.</p>
      <Field label="Your password, to confirm" name="password" type="password" autoComplete="current-password" required />
      {error && (
        <p role="alert" className="text-sm font-semibold text-bad-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" kind="primary" disabled={busy} className="bg-bad-ink text-surface hover:bg-bad-ink/90">
          Delete my account
        </Button>
        <Button kind="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
