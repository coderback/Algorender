'use client';

import Link from 'next/link';
import Image from 'next/image';
import SearchBar from './SearchBar';
import { ThemeToggle } from './ThemeToggle';
import { AccountMenu } from './account/AccountMenu';
import { dataStructures, algorithms, mathTopics, systemsTopics } from '@/data/visualisers';

const navLink = 'text-sm font-medium text-ink-soft hover:text-accent-ink';

export default function Header() {
  return (
    <header className="w-full bg-surface shadow-xs sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-6 shrink-0">
            {/* The brand is not the page's heading: each page has its own <h1>. */}
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.svg" alt="" width={48} height={48} className="h-10 w-10 object-contain sm:h-12 sm:w-12" />
              <span className="text-2xl font-bold text-ink tracking-tight">Algorender</span>
            </Link>
            {/* Beside the brand from sm up; on phones it moves to its own row, after the search. */}
            <nav aria-label="Main" className="hidden items-center gap-4 sm:flex lg:gap-5">
              <Link href="/learn" className={navLink}>Learn</Link>
              <Link href="/plan" className={navLink}>Plan</Link>
              <Link href="/code" className={navLink}>Code</Link>
              <Link href="/practice" className={navLink}>Practice</Link>
              <Link href="/play" className={navLink}>Play</Link>
              <Link href="/compare" className={navLink}>Compare sorts</Link>
              <AccountMenu linkClass={navLink} />
            </nav>
          </div>

          <div className="flex grow items-center gap-2 sm:max-w-md">
            <div className="grow">
              <SearchBar dataStructures={dataStructures} algorithms={algorithms} mathTopics={mathTopics} systemsTopics={systemsTopics} />
            </div>
            <ThemeToggle />
          </div>

          <nav aria-label="Main" className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 sm:hidden">
            <Link href="/learn" className={navLink}>Learn</Link>
            <Link href="/plan" className={navLink}>Plan</Link>
            <Link href="/code" className={navLink}>Code</Link>
            <Link href="/practice" className={navLink}>Practice</Link>
            <Link href="/play" className={navLink}>Play</Link>
            <Link href="/compare" className={navLink}>Compare sorts</Link>
            <AccountMenu linkClass={navLink} />
          </nav>
        </div>
      </div>
    </header>
  );
}
