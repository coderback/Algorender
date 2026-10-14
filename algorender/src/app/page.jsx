"use client";
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dataStructures, algorithms } from '@/data/visualisers';

function Home() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'algorithms' ? 'algorithms' : 'data-structures';
  const [activeTab, setActiveTab] = useState(initialTab);

  const items = activeTab === 'data-structures' ? dataStructures : algorithms;
  const categories = [...new Set(items.map(item => item.category))];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 text-gray-800">
      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Data Structure & Algorithm Visualizer
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Interactive visualizations of algorithms and data structures to help you understand how they work.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-2xl">
            <TabsList className="grid w-full grid-cols-2 h-14">
              <TabsTrigger 
                value="data-structures"
                className="text-base font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white"
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
                className="text-base font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Algorithms
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-8">
          {categories.map(category => (
            <div key={category} className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items
                  .filter(item => item.category === category)
                  .map(item => (
                    <Link
                      key={item.name}
                      href={item.path}
                      className="group block"
                    >
                      <div className="h-full bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100">
                        <div className="flex items-start justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {item.name}
                          </h3>
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                          {item.description}
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="w-24 text-gray-500">Time:</span>
                            <span className="font-medium text-gray-700">
                              {item.timeComplexity.average}
                            </span>
                          </div>
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="w-24 text-gray-500">Space:</span>
                            <span className="font-medium text-gray-700">
                              {item.spaceComplexity}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// Wrapper component to ensure useSearchParams is rendered inside Suspense
export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <Home />
        </Suspense>
      </main>
    </div>
  );
}
