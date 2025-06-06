'use client';

import Header from '@/components/Header';
import CategoryTabs from '@/components/CategoryTabs';
import CategoryGrid from '@/components/CategoryGrid';
import { useState } from 'react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('data');

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 text-gray-800">
      <Header/>
      <main className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-center mb-4">Algorithm Visualizer</h1>
        <p className="text-center text-lg text-gray-600 mb-10">
          Interactive visualizations of data structures and algorithms to help you
          understand complex computer science concepts through step-by-step animations.
        </p>

        <CategoryTabs activeTab={activeTab} setActiveTab={setActiveTab} />

        <CategoryGrid activeTab={activeTab} />
      </main>
    </div>
  );
}
