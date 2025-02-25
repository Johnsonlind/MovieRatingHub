import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import { searchMedia } from '../lib/api/tmdb/index';
import { messages } from '../lib/constants/messages';
import { ThemeToggle } from '../components/ThemeToggle';
import { CDN_URL } from '../lib/config';
import { useLocation, useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'movies' | 'tvShows'>('movies');

  const location = useLocation();
  const searchFromState = location.state?.searchQuery;

  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', searchQuery, page],
    queryFn: () => searchMedia(searchQuery, { page }),
    enabled: !!searchQuery,
  });

  useEffect(() => {
    if (searchFromState) {
      setSearchQuery(searchFromState);
      // 清除 state 以防止重复搜索
      navigate('/', { replace: true });
    }
  }, [searchFromState]);

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <ThemeToggle />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center mb-3">
            <img 
              src={`${CDN_URL}/logos/home.png`}
              alt="Rating Card" 
              className="w-12 h-12 object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold mb-2 dark:text-gray-100">RateFuse</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            搜索并对比多平台影视评分
          </p>
        </div>

        <div className="mb-8">
          <SearchBar onSearch={(query) => {
            setSearchQuery(query);
            setPage(1);
          }} />
        </div>

        {/* Tabs - Mobile */}
        <div className="lg:hidden mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('movies')}
              className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                activeTab === 'movies'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white'
              }`}
            >
              电影
            </button>
            <button
              onClick={() => setActiveTab('tvShows')}
              className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                activeTab === 'tvShows'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              剧集
            </button>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">{messages.loading}</span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">
              {error instanceof Error ? error.message : messages.errors.loadRatingsFailed}
            </p>
          </div>
        ) : !data && searchQuery ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">{messages.errors.noResults}</p>
          </div>
        ) : data ? (
          <>
            {/* Mobile View */}
            <div className="lg:hidden">
              {activeTab === 'movies' ? (
                <SearchResults
                  items={data.movies.results}
                  totalPages={data.movies.totalPages}
                  currentPage={page}
                  onPageChange={setPage}
                  title="电影"
                />
              ) : (
                <SearchResults
                  items={data.tvShows.results}
                  totalPages={data.tvShows.totalPages}
                  currentPage={page}
                  onPageChange={setPage}
                  title="剧集"
                />
              )}
            </div>

            {/* Desktop View */}
            <div className="hidden lg:grid grid-cols-2 gap-8">
              <div>
                <SearchResults
                  items={data.movies.results}
                  totalPages={data.movies.totalPages}
                  currentPage={page}
                  onPageChange={setPage}
                  title="电影"
                />
              </div>
              <div>
                <SearchResults
                  items={data.tvShows.results}
                  totalPages={data.tvShows.totalPages}
                  currentPage={page}
                  onPageChange={setPage}
                  title="剧集"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}