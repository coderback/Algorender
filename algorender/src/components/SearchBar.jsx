'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBar({ dataStructures, algorithms, mathTopics, systemsTopics }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();

  const allItems = [
    ...(dataStructures || []).map(item => ({ ...item, type: 'Data Structure' })),
    ...(algorithms || []).map(item => ({ ...item, type: 'Algorithm' })),
    ...(mathTopics || []).map(item => ({ ...item, type: 'Math & ML' })),
    ...(systemsTopics || []).map(item => ({ ...item, type: 'Systems' }))
  ];

  const filteredItems = allItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (item) => {
    setSearchQuery('');
    setShowSuggestions(false);
    router.push(item.path);
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Search visualizers..."
          className="w-full px-4 py-2 text-ink-soft bg-surface border rounded-lg focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent-line"
        />
        <button
          onClick={() => setSearchQuery('')}
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-ink-muted hover:text-ink-soft ${
            !searchQuery && 'hidden'
          }`}
        >
          ×
        </button>
      </div>

      {showSuggestions && searchQuery && (
        <div className="absolute z-10 w-full mt-1 max-h-80 overflow-y-auto bg-surface rounded-lg shadow-lg border border-line">
          {filteredItems.length > 0 ? (
            <ul className="py-1">
              {filteredItems.map((item, index) => (
                <li
                  key={index}
                  onClick={() => handleSearch(item)}
                  className="px-4 py-2 text-ink-soft hover:bg-sunken cursor-pointer flex justify-between items-center"
                >
                  <span className="text-ink font-medium">{item.name}</span>
                  <span className="text-xs text-accent-ink">{item.type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-2 text-ink-muted">No results found</div>
          )}
        </div>
      )}
    </div>
  );
} 