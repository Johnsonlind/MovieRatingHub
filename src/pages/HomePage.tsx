import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import { Film } from 'lucide-react';
import { searchMedia } from '../lib/api/tmdb/index';
import { messages } from '../lib/constants/messages';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'movies' | 'tv'>('movies');

  const { data, isLoading } = useQuery({
    queryKey: ['search', searchQuery, page],
    queryFn: () => searchMedia(searchQuery, { page }),
    enabled: !!searchQuery,
  });

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <div className="text-center mb-6 sm:mb-8">
        <div className="flex items-center justify-center mb-3">
          <Film className="w-8 h-8 sm:w-12 sm:h-12 text-blue-600" />
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold mb-2">{messages.search.title}</h1>
        <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
          {messages.search.subtitle}
        </p>
      </div>

      <SearchBar onSearch={(query) => {
        setSearchQuery(query);
        setPage(1);
      }} />

      {isLoading ? (
        <div className="text-center mt-6">{messages.loading}</div>
      ) : data ? (
        <div className="mt-6">
          {/* Mobile Tabs */}
          <div className="flex lg:hidden mb-4">
            <button
              onClick={() => setActiveTab('movies')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'movies'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500'
              }`}
            >
              电影
            </button>
            <button
              onClick={() => setActiveTab('tv')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'tv'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500'
              }`}
            >
              剧集
            </button>
          </div>

          {/* Mobile View */}
          <div className="lg:hidden">
            {activeTab === 'movies' ? (
              <SearchResults
                items={data.movies.results}
                totalPages={data.movies.totalPages}
                currentPage={page}
                onPageChange={setPage}
              />
            ) : (
              <SearchResults
                items={data.tvShows.results}
                totalPages={data.tvShows.totalPages}
                currentPage={page}
                onPageChange={setPage}
              />
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden lg:flex lg:gap-8">
            <div className="flex-1">
              <SearchResults
                items={data.movies.results}
                totalPages={data.movies.totalPages}
                currentPage={page}
                onPageChange={setPage}
                title="电影"
              />
            </div>
            <div className="flex-1">
              <SearchResults
                items={data.tvShows.results}
                totalPages={data.tvShows.totalPages}
                currentPage={page}
                onPageChange={setPage}
                title="剧集"
              />
            </div>
          </div>
        </div>
      ) : searchQuery ? (
        <div className="text-center mt-6 text-gray-600">
          {messages.errors.noResults}
        </div>
      ) : null}
    </div>
  );
}