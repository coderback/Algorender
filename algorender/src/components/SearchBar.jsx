'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBar({ dataStructures, algorithms }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();

  const allItems = [
    ...(dataStructures || []).map(item => ({ ...item, type: 'Data Structure' })),
    ...(algorithms || []).map(item => ({ ...item, type: 'Algorithm' }))
  ];

  const filteredItems = allItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (item) => {
    setSearchQuery('');
    setShowSuggestions(false);
    router.push(`/visualisers/${item.name.toLowerCase().replace(/ /g, '-')}`);
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
          className="w-full px-4 py-2 text-gray-700 bg-white border rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          onClick={() => setSearchQuery('')}
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 ${
            !searchQuery && 'hidden'
          }`}
        >
          ×
        </button>
      </div>

      {showSuggestions && searchQuery && (
        <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200">
          {filteredItems.length > 0 ? (
            <ul className="py-1">
              {filteredItems.map((item, index) => (
                <li
                  key={index}
                  onClick={() => handleSearch(item)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                >
                  <span className="text-gray-900 font-medium">{item.name}</span>
                  <span className="text-xs text-blue-500">{item.type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-2 text-gray-500">No results found</div>
          )}
        </div>
      )}
    </div>
  );
} 