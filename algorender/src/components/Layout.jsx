'use client';

import Link from 'next/link';
import Header from './Header';

export default function Layout({ children, title, description, timeComplexity, spaceComplexity }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/">
            <span className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Categories
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 py-8 sm:px-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{title}</h1>
            <p className="text-lg text-gray-600 mb-8">{description}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-blue-800 mb-1">Best Case</h3>
                <p className="text-2xl font-semibold text-blue-900">{timeComplexity.best}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-green-800 mb-1">Average Case</h3>
                <p className="text-2xl font-semibold text-green-900">{timeComplexity.average}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-red-800 mb-1">Worst Case</h3>
                <p className="text-2xl font-semibold text-red-900">{timeComplexity.worst}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-8">
              <h3 className="text-sm font-medium text-gray-800 mb-1">Space Complexity</h3>
              <p className="text-2xl font-semibold text-gray-900">{spaceComplexity}</p>
            </div>

            {children}
          </div>
        </div>
      </main>
    </div>
  );
} 