"use client";
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dataStructures, algorithms, mathTopics, systemsTopics } from '@/data/visualisers';

function Home() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const initialTab = tab === 'algorithms' || tab === 'math' || tab === 'systems' ? tab : 'data-structures';
  const [activeTab, setActiveTab] = useState(initialTab);


  return (
    <div className="min-h-screen bg-linear-to-b from-surface to-accent-soft text-ink">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text dark:from-blue-400 dark:to-purple-400 text-transparent">
            Data Structure & Algorithm Visualizer
          </h1>
          <p className="text-ink-soft text-lg max-w-2xl mx-auto">
            Interactive visualizations of algorithms and data structures to help you understand how they work.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/learn" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-strong">
              Start with the concept map and lessons
            </Link>
            <Link href="/practice" className="rounded-full border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:border-accent-line">
              Practise interview problems
            </Link>
            <Link href="/compare" className="rounded-full border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:border-accent-line">
              Race the sorting algorithms
            </Link>
          </div>
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
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <Home />
        </Suspense>
      </main>
    </div>
  );
}
