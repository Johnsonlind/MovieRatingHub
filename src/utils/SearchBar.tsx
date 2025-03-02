// ==========================================
// 搜索栏
// ==========================================
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { messages } from './messages';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={messages.search.placeholder}
          className="w-full px-4 py-2 sm:py-3 pl-10 sm:pl-12 text-base sm:text-lg rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
        />
        <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="mt-2 text-sm text-gray-500 text-center">
        <p>支持多语言搜索、年份 ("星际穿越 2014") 和 IMDB ID (tt1234567)</p>
      </div>
    </form>
  );
}
