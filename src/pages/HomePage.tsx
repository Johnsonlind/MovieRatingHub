// ==========================================
// 首页 - 搜索功能和热门榜单展示
// ==========================================
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '../utils/SearchBar';
import { SearchResults } from '../utils/SearchResults';
import { searchMedia } from '../api/index';
import { messages } from '../utils/messages';
import { ThemeToggle } from '../utils/ThemeToggle';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { UserButton } from '../utils/UserButton';
import { MiniFavoriteButton } from '../utils/MiniFavoriteButton';

// 页脚组件
const Footer = () => (
  <div className="w-full py-6 mt-8 flex justify-center items-center gap-2">
    <a 
      href="https://weibo.com/u/2238200645" 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-balck-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
    >
      <img src="/logos/weibo.png" alt="微博" className="w-5 h-5" />
      <span>守望电影</span>
    </a>
  </div>
);

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
      navigate('/', { replace: true });
    }
  }, [searchFromState]);

  function TopSectionsFromBackend() {
    const { data, isLoading } = useQuery({
      queryKey: ['aggregate-charts'],
      queryFn: () => fetch('/api/charts/aggregate').then(r => r.json()),
    });

    const Section = ({ title, items }:{ title: string; items?: Array<{ id: number; type: 'movie' | 'tv'; title: string; poster: string }> }) => (
      <div className="mb-8">
        <h2 className="text-lg sm:text-xl lg:text-2xl font-bold mb-4 text-center dark:text-gray-100">{title}</h2>
        {!items || isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-600 dark:text-gray-400">加载中...</div>
        ) : (
          <>
            {/* 第一行：前5个 */}
            <div className="grid grid-cols-5 gap-2 sm:gap-3 lg:gap-4 mb-2 sm:mb-3">
              {items.slice(0, 5).map((item) => {
                const linkPath = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
                return (
                  <div key={`${item.type}-${item.id}`} className="group">
                    <div className="w-full aspect-[2/3] overflow-hidden rounded-md bg-gray-200 dark:bg-gray-800 relative">
                      <Link to={linkPath}>
                        <img
                          src={item.poster
                            ? (
                                item.poster.startsWith('/api/')
                                  ? item.poster
                                  : `/api/image-proxy?url=${encodeURIComponent(item.poster)}`
                              )
                            : '/placeholder-poster.png'}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                          crossOrigin="anonymous"
                        />
                      </Link>
                      <div className="absolute bottom-2 right-2">
                        <MiniFavoriteButton
                          mediaId={item.id.toString()}
                          mediaType={item.type}
                          title={item.title}
                          poster={item.poster}
                        />
                      </div>
                    </div>
                    <div className="mt-1 sm:mt-2 text-xs sm:text-sm line-clamp-2 text-center dark:text-gray-100">{item.title}</div>
                  </div>
                );
              })}
            </div>
            {/* 第二行：后5个 */}
            <div className="grid grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
              {items.slice(5, 10).map((item) => {
                const linkPath = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
                return (
                  <div key={`${item.type}-${item.id}`} className="group">
                    <div className="w-full aspect-[2/3] overflow-hidden rounded-md bg-gray-200 dark:bg-gray-800 relative">
                      <Link to={linkPath}>
                        <img
                          src={item.poster
                            ? (
                                item.poster.startsWith('/api/')
                                  ? item.poster
                                  : `/api/image-proxy?url=${encodeURIComponent(item.poster)}`
                              )
                            : '/placeholder-poster.png'}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                          crossOrigin="anonymous"
                        />
                      </Link>
                      <div className="absolute bottom-2 right-2">
                        <MiniFavoriteButton
                          mediaId={item.id.toString()}
                          mediaType={item.type}
                          title={item.title}
                          poster={item.poster}
                        />
                      </div>
                    </div>
                    <div className="mt-1 sm:mt-2 text-xs sm:text-sm line-clamp-2 text-center dark:text-gray-100">{item.title}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="本周Top10 热门电影" items={data?.top_movies} />
        <Section title="本周Top10 热门剧集" items={data?.top_tv} />
        <Section title="本周Top10 华语剧集" items={data?.top_chinese_tv} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <ThemeToggle />
      <div className="absolute top-2 sm:top-3 right-2 sm:right-2 z-30">
        <UserButton />
      </div>
      
      {/* 标头 */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center mb-3">
            <img 
              src={`/logos/home.png`}
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

        {/* 移动端标签 */}
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

        {/* 无搜索时显示Top10板块（聚合） */}
        {!searchQuery && <TopSectionsFromBackend />}

        {/* 搜索结果 */}
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
            {/* 移动端视图 */}
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

            {/* 桌面视图 */}
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

      <Footer />
    </div>
  );
}
