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
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.svg" alt="Algorender Logo" width={48} height={48} className="object-contain" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight cursor-pointer">
              Algorender
            </h1>
          </Link>
          
          <div className="grow max-w-md">
            <SearchBar dataStructures={dataStructures} algorithms={algorithms} />
          </div>
        </div>
      </div>
    </header>
  );
}