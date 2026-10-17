'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FiCheckCircle, FiCloud, FiCloudOff, FiGithub, FiLoader, FiLogOut, FiRefreshCw } from 'react-icons/fi';
import { authClient } from '@/lib/auth-client';
import { useLessonProgress, useProblemProgress, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { progressStore, type SyncStatus } from '@/progress/store';

import type { SocialProvider as Provider } from '@/server/providers';

/**
 * Sign in or create an account, or, once signed in: how progress is syncing,
 * a summary of it, signing out and deleting the account.
 */
export function AccountPanel({ providers }: { providers: Provider[] }) {
  const session = authClient.useSession();
  if (session.isPending) {
    return (
      <p className="flex items-center gap-2 text-ink-soft" role="status">
        <FiLoader aria-hidden className="animate-spin" /> Checking your session…
      </p>
    );
  }
  const user = session.data?.user;
  return user ? <SignedIn name={user.name} email={user.email} /> : <SignInForms providers={providers} offline={session.error != null} />;
}

/** Where to go once signed in (?next=/practice/two-sum, from a page that needed an account): a path on this site, or null. */
function nextPage(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
}

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
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
        <div role="group" aria-label="Sign in or create an account" className="mb-4 inline-flex overflow-hidden rounded-lg border border-line">
          {(['sign-in', 'sign-up'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`px-3 py-1.5 text-sm ${mode === m ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'}`}
            >
              {m === 'sign-in' ? 'Sign in' : 'Create an account'}
            </button>
          ))}
        </div>
        {offline && (
          <p className="mb-3 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-ink">
            You seem to be offline. Your progress is still saved on this device.
          </p>
        )}
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          {mode === 'sign-up' && <Field label="Name" name="name" autoComplete="name" />}
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
          />
          {error && (
            <p role="alert" className="rounded-lg border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad-ink">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy && <FiLoader aria-hidden className="animate-spin" />}
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {providers.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-line-soft pt-4">
            {providers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void authClient.signIn.social({ provider: p, callbackURL: nextPage() ?? '/account' })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-sunken"
              >
                {p === 'github' ? <FiGithub aria-hidden /> : null}
                Continue with {p === 'github' ? 'GitHub' : 'Google'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3 text-sm text-ink-soft">
        <h2 className="text-lg font-semibold text-ink">Why sign in?</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your lessons, exercises, solved problems and review cards follow you to every device.</li>
          <li>Everything you’ve done on this device so far comes with you when you sign in.</li>
          <li>It all keeps working offline, and syncs when you’re back.</li>
        </ul>
        <p>Without an account, progress stays in this browser.</p>
      </div>
    </div>
  );
}

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      <input {...input} className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink focus:border-accent focus:outline-2 focus:outline-accent" />
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

function SignedIn({ name, email }: { name: string; email: string }) {
  const snapshot = useProgressSnapshot();
  const lessons = useLessonProgress();
  const problems = useProblemProgress();
  const cards = useReviewCards();
  const solved = Object.values(problems).filter((p) => p.solved).length;
  const [leaving, setLeaving] = useState(false);

  const signOut = async () => {
    setLeaving(true);
    await progressStore().signOut();
    await authClient.signOut();
    setLeaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
        <div>
          <p className="font-semibold text-ink">{name}</p>
          <p className="text-sm text-ink-soft">{email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={leaving}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-sunken disabled:opacity-60"
        >
          {leaving ? <FiLoader aria-hidden className="animate-spin" /> : <FiLogOut aria-hidden />} Sign out
        </button>
      </div>

      <section aria-labelledby="sync-title" className="rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
        <h2 id="sync-title" className="text-lg font-semibold text-ink">
          Sync
        </h2>
        <SyncLine status={snapshot.sync} />
        <button
          type="button"
          onClick={() => void progressStore().syncNow()}
          disabled={snapshot.sync.state === 'syncing'}
          className="mt-3 inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-accent-ink hover:bg-sunken disabled:opacity-60"
        >
          <FiRefreshCw aria-hidden /> Sync now
        </button>
      </section>

      <section aria-labelledby="progress-title" className="rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
        <h2 id="progress-title" className="text-lg font-semibold text-ink">
          Your progress
        </h2>
        <ul className="mt-3 grid grid-cols-3 gap-3 text-center">
          <Stat label="Lessons done" value={lessons.completed.length} href="/learn" />
          <Stat label="Problems solved" value={solved} href="/practice" />
          <Stat label="Review cards" value={cards.size} href="/review" />
        </ul>
      </section>

      <DeleteAccount />
    </div>
  );
}

function SyncLine({ status }: { status: SyncStatus }) {
  const waiting = status.pending > 0 ? ` ${status.pending} ${status.pending === 1 ? 'change waits' : 'changes wait'} to sync.` : '';
  const line: Record<SyncStatus['state'], [ReactNode, string]> = {
    local: [<FiCloudOff key="i" aria-hidden />, 'Not syncing.'],
    syncing: [<FiLoader key="i" aria-hidden className="animate-spin" />, 'Syncing…'],
    idle: [<FiCheckCircle key="i" aria-hidden className="text-good-ink" />, status.lastSynced ? `Synced ${new Date(status.lastSynced).toLocaleString()}.${waiting}` : `Connected.${waiting}`],
    offline: [<FiCloudOff key="i" aria-hidden />, `Offline: everything is saved on this device and syncs when you’re back.${waiting}`],
    error: [<FiCloud key="i" aria-hidden className="text-bad-ink" />, `${status.message ?? 'Sync failed.'}${waiting}`],
  };
  const [icon, text] = line[status.state];
  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft" role="status">
      <span className="mt-0.5">{icon}</span> {text}
    </p>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li>
      <Link href={href} className="block rounded-lg border border-line-soft px-2 py-3 hover:border-accent-line">
        <span className="block text-2xl font-bold text-ink">{value}</span>
        <span className="block text-xs text-ink-soft">{label}</span>
      </Link>
    </li>
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

  return (
    <section aria-labelledby="delete-title" className="rounded-xl border border-bad-line bg-surface p-5">
      <h2 id="delete-title" className="text-lg font-semibold text-ink">
        Delete your account
      </h2>
      <p className="mt-1 text-sm text-ink-soft">This deletes your account and all the progress saved to it, on every device. It can’t be undone.</p>
      {open ? (
        <form onSubmit={(e) => void remove(e)} className="mt-3 space-y-3">
          <Field label="Your password, to confirm" name="password" type="password" autoComplete="current-password" required />
          {error && (
            <p role="alert" className="rounded-lg border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad-ink">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-bad-ink px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-60">
              Delete my account
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-sunken">
              Keep it
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-md px-2.5 py-1.5 text-sm text-bad-ink hover:bg-bad-soft">
          Delete account…
        </button>
      )}
    </section>
  );
}
