import type { Metadata } from 'next';
import { AccountPanel } from '@/components/account/AccountPanel';
import { socialProviders } from '@/server/providers';

export const metadata: Metadata = {
  title: 'Your account | Algorender',
  description: 'Sign in to keep your lessons, solved problems and review cards in sync across devices.',
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">Account</div>
      <h1 className="mb-6 text-3xl font-bold text-ink">Your account</h1>
      <AccountPanel providers={socialProviders()} />
    </main>
  );
}
