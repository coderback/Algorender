"use client";
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dataStructures, algorithms, mathTopics, systemsTopics } from '@/data/visualisers';

const visualisers = [...dataStructures, ...algorithms, ...mathTopics, ...systemsTopics];

function Home() {
  const searchParams = useSearchParams();
  const kind = searchParams.get('kind');
  const initialTab = kind === 'algorithms' || kind === 'math' || kind === 'systems' ? kind : 'data-structures';
  const [activeTab, setActiveTab] = useState(initialTab);


  return (
    <div className="text-ink">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* TODO(redesign): Phase 5 rebuilds this page as the Explore library (filters, sort, track tiles). */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-2xl flex-col gap-3">
            <h1 className="font-display text-title-page">Explore</h1>
            <p className="text-base text-ink-soft">
              {visualisers.length} visualisers you can step through, predict and replay.
            </p>
          </div>
          <Link href="/compare" className="flex flex-col gap-1 rounded-tile bg-feature px-6 py-5 text-on-feature">
            <span className="text-eyebrow text-feature-muted uppercase">Lab</span>
            <span className="font-display text-title-card">Race the sorts →</span>
          </Link>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex justify-center mb-8">
            <TabsList className="grid h-auto w-full max-w-4xl grid-cols-2 sm:h-14 sm:grid-cols-4">
              <TabsTrigger 
                value="data-structures"
                className="text-base font-medium data-[state=active]:bg-accent data-[state=active]:text-on-accent"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v4" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14h6" />
                  </svg>
                  Data Structures
                </span>
              </TabsTrigger>
              <TabsTrigger 
                value="algorithms"
                className="text-base font-medium data-[state=active]:bg-accent data-[state=active]:text-on-accent"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Algorithms
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="math"
                className="text-base font-medium data-[state=active]:bg-accent data-[state=active]:text-on-accent"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15c2-6 4-9 6-9s3 4 6 4" />
                  </svg>
                  Math &amp; ML
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="systems"
                className="text-base font-medium data-[state=active]:bg-accent data-[state=active]:text-on-accent"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <rect x="3" y="4" width="18" height="6" rx="1.5" strokeWidth={2} />
                    <rect x="3" y="14" width="18" height="6" rx="1.5" strokeWidth={2} />
                    <path strokeLinecap="round" strokeWidth={2} d="M7 7h.01M7 17h.01" />
                  </svg>
                  Systems
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Each tab owns its panel, so the tab's aria-controls points at a real element. */}
          {[['data-structures', dataStructures], ['algorithms', algorithms], ['math', mathTopics], ['systems', systemsTopics]].map(([tab, items]) => (
            <TabsContent key={tab} value={tab} className="mt-0 space-y-8">
              {[...new Set(items.map(item => item.category))].map(category => (
                <div key={category} className="space-y-4">
                  <h2 className="text-2xl font-semibold text-ink">{category}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items
                      .filter(item => item.category === category)
                      .map(item => (
                        <Link
                          key={item.name}
                          href={item.path}
                          className="group block"
                        >
                          <div className="h-full bg-surface rounded-xl shadow-xs hover:shadow-md transition-shadow p-6 border border-line-soft">
                            <div className="flex items-start justify-between mb-4">
                              <h3 className="text-lg font-semibold text-ink group-hover:text-accent-ink transition-colors">
                                {item.name}
                              </h3>
                              <span className="px-2 py-1 text-xs font-medium bg-accent-soft text-accent-ink rounded-full">
                                {item.category}
                              </span>
                            </div>
                            <p className="text-ink-soft text-sm mb-4 line-clamp-2">
                              {item.description}
                            </p>
                            {item.timeComplexity && <div className="space-y-2">
                              <div className="flex items-center text-sm text-ink-muted">
                                <span className="w-24 text-ink-muted">Time:</span>
                                <span className="font-medium text-ink-soft">
                                  {item.timeComplexity.average}
                                </span>
                              </div>
                              <div className="flex items-center text-sm text-ink-muted">
                                <span className="w-24 text-ink-muted">Space:</span>
                                <span className="font-medium text-ink-soft">
                                  {item.spaceComplexity}
                                </span>
                              </div>
                            </div>}
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

// Wrapper component to ensure useSearchParams is rendered inside Suspense
export default function Page() {
  return (
    <main>
      <Suspense fallback={<div>Loading...</div>}>
        <Home />
      </Suspense>
    </main>
  );
}
