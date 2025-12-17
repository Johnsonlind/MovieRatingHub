// ==========================================
// 榜单详情页 - 显示完整的 Top 250 榜单
// ==========================================
import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from '../utils/ThemeToggle';
import { NavBar } from '../utils/NavBar';
import { ScrollToTopButton } from '../utils/ScrollToTopButton';
import { MiniFavoriteButton } from '../utils/MiniFavoriteButton';
import { ArrowLeft } from 'lucide-react';

// 平台logo映射
const PLATFORM_LOGOS: Record<string, string> = {
  '豆瓣': '/logos/douban.png',
  'IMDb': '/logos/imdb.png',
  '烂番茄': '/logos/rottentomatoes.png',
  'Rotten Tomatoes': '/logos/rottentomatoes.png',
  'MTC': '/logos/metacritic.png',
  'Metacritic': '/logos/metacritic.png',
  'Letterboxd': '/logos/letterboxd.png',
  'TMDB': '/logos/tmdb.png',
  'Trakt': '/logos/trakt.png',
};

interface ChartEntry {
  tmdb_id: number;
  rank: number;
  title: string;
  poster: string;
  media_type?: 'movie' | 'tv';
}

interface ChartDetail {
  platform: string;
  chart_name: string;
  media_type: 'movie' | 'tv' | 'both';
  entries: ChartEntry[];
}

export default function ChartDetailPage() {
  const { platform, chartName } = useParams<{ platform: string; chartName: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (chartName) {
      document.title = `${chartName} - RateFuse`;
    } else {
      document.title = '榜单详情 - RateFuse';
    }
  }, [chartName]);

  // 获取完整榜单数据
  const { data, isLoading, error } = useQuery<ChartDetail>({
    queryKey: ['chart-detail', platform, chartName],
    queryFn: async () => {
      if (!platform || !chartName) {
        throw new Error('缺少必要参数');
      }
      const response = await fetch(
        `/api/charts/detail?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chartName)}`
      );
      if (!response.ok) {
        throw new Error('获取榜单数据失败');
      }
      return response.json();
    },
    enabled: !!platform && !!chartName,
  });

  if (isLoading) {
    return (
      <>
        <NavBar />
        <div className="min-h-screen bg-[var(--page-bg)] pt-16 p-4">
          <ThemeToggle />
          <ScrollToTopButton />
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-600 dark:text-gray-400">加载中...</div>
          </div>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="min-h-screen bg-[var(--page-bg)] pt-16 p-4">
          <ThemeToggle />
          <ScrollToTopButton />
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-gray-600 dark:text-gray-400 mb-4">
              加载失败，请稍后重试
            </div>
            <button
              onClick={() => navigate('/charts')}
              className="glass-button px-4 py-2 text-gray-800 dark:text-white"
            >
              返回榜单页
            </button>
          </div>
        </div>
      </>
    );
  }

  const sortedEntries = [...data.entries].sort((a, b) => a.rank - b.rank);

  // 判断是否是 Metacritic Top 250 榜单
  const isMetacriticTop250 = data.chart_name === 'Metacritic 史上最佳电影 Top 250' || 
                             data.chart_name === 'Metacritic 史上最佳剧集 Top 250';
  
  // 对于 Metacritic Top 250 榜单，只取前250个条目，否则使用全部条目
  const displayedEntries = isMetacriticTop250 ? sortedEntries.slice(0, 250) : sortedEntries;
  
  // 对于 Metacritic Top 250 榜单，显示 250，否则显示实际数量
  const displayCount = isMetacriticTop250 ? 250 : sortedEntries.length;

  return (
    <>
      <NavBar />
      <div className="min-h-screen bg-[var(--page-bg)] pt-16 p-4">
        <ThemeToggle />
        <ScrollToTopButton />

        <div className="max-w-7xl mx-auto space-y-6">
          {/* 返回按钮和标题 */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate('/charts')}
              className="glass-button p-2 flex items-center justify-center text-gray-800 dark:text-white hover:scale-105 transition-all"
              aria-label="返回榜单页"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              {PLATFORM_LOGOS[data.platform] && (
                <img 
                  src={PLATFORM_LOGOS[data.platform]} 
                  alt={data.platform}
                  className="w-8 h-8 object-contain"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                  {data.chart_name}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {data.platform} · 共 {displayCount} 部作品
                </p>
              </div>
            </div>
          </div>

          {/* 榜单内容 */}
          {displayedEntries.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                暂无数据
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-6">
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                {displayedEntries.map(entry => {
                  const mediaType = entry.media_type || 
                    (data.media_type === 'both' ? 'movie' : data.media_type);
                  const linkPath = mediaType === 'movie' 
                    ? `/movie/${entry.tmdb_id}` 
                    : `/tv/${entry.tmdb_id}`;
                  
                  return (
                    <div key={`${entry.tmdb_id}-${entry.rank}`} className="group relative">
                      <Link to={linkPath} target="_blank" rel="noopener noreferrer">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden glass-card relative">
                          {entry.poster ? (
                            <img
                              src={/^(http|\/api|\/tmdb-images)/.test(entry.poster) 
                                ? entry.poster 
                                : `/api/image-proxy?url=${encodeURIComponent(entry.poster)}`}
                              alt={entry.title}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                              loading="lazy"
                              style={{ willChange: 'transform' }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                              无海报
                            </div>
                          )}
                          {/* 排名标签 - 红色丝带样式 */}
                          <div className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 10 }}>
                            <svg width="36" height="28" viewBox="0 0 36 28" className="drop-shadow-md" style={{ display: 'block' }}>
                              {/* 红色丝带形状 */}
                              <path
                                d="M 0 7 Q 0 0 7 0 L 29 0 Q 36 0 36 7 L 36 28 L 18 22 L 0 28 Z"
                                fill="#DC2626"
                                stroke="none"
                              />
                              {/* 排名数字 - 白色 */}
                              <text
                                x="18"
                                y="13"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-[15px] font-bold fill-white"
                                style={{ fontSize: '15px', fontWeight: 'bold' }}
                              >
                                {entry.rank}
                              </text>
                            </svg>
                          </div>
                          <div className="absolute top-1 right-1 z-20">
                            <MiniFavoriteButton
                              mediaId={entry.tmdb_id.toString()}
                              mediaType={mediaType}
                              title={entry.title}
                              poster={entry.poster}
                              className="p-1"
                            />
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-center text-gray-700 dark:text-gray-300 line-clamp-2">
                          {entry.title}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

