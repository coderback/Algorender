'use client';

import Link from 'next/link';
import Image from 'next/image';
import SearchBar from './SearchBar';
import { dataStructures, algorithms } from '@/data/visualisers';

export default function Header() {
  return (
    <header className="w-full bg-white shadow-xs sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 shrink-0">
            {/* The brand is not the page's heading: each page has its own <h1>. */}
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.svg" alt="" width={48} height={48} className="object-contain" />
              <span className="text-2xl font-bold text-gray-900 tracking-tight">Algorender</span>
            </Link>
            <nav aria-label="Main" className="hidden sm:block">
              <Link href="/compare" className="text-sm font-medium text-gray-600 hover:text-blue-700">
                Compare sorts
              </Link>
            </nav>
          </div>

          <div className="grow max-w-md">
            <SearchBar dataStructures={dataStructures} algorithms={algorithms} />
          </div>
        </div>
      </div>
    </header>
  );
}
