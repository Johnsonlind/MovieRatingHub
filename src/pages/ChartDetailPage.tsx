// ==========================================
// 榜单详情页
// ==========================================
import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Grid } from 'react-window';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { NavBar } from '../components/ui/NavBar';
import { ScrollToTopButton } from '../components/ui/ScrollToTopButton';
import { MiniFavoriteButton } from '../components/ui/MiniFavoriteButton';
import { ArrowLeft } from 'lucide-react';
import { useAggressiveImagePreload } from '../hooks/useAggressiveImagePreload';
import { Footer } from '../components/common/Footer';

const downscaleTmdb = (url: string) => {
  const tmdbPattern = /https?:\/\/image\.tmdb\.org\/t\/p\/(original|w\d+)(\/.+)/;
  const match = url.match(tmdbPattern);
  if (match) return `https://image.tmdb.org/t/p/w342${match[2]}`;
  if (url.startsWith('/tmdb-images/')) {
    const path = url.replace(/^\/tmdb-images\/(?:original|w\d+)/, '');
    return `https://image.tmdb.org/t/p/w342${path}`;
  }
  return url;
};

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
  const contentRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });
  const GAP = 12;
  const USE_VIRTUAL_THRESHOLD = 60;
  const gridWidth = gridSize.w;
  const gridHeight = gridSize.h;

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
    placeholderData: (previousData) => previousData,
  });

  useAggressiveImagePreload(contentRef, !isLoading && !!data);

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const update = () => setGridSize({ w: el.offsetWidth || 0, h: el.offsetHeight || 0 });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [data]);

  if (isLoading) {
    return (
      <>
        <NavBar />
        <ThemeToggle />
        <ScrollToTopButton />
        <div className="min-h-screen pt-16 p-4 flex items-center justify-center safe-area-bottom">
          <div className="text-gray-600 dark:text-gray-400">加载中...</div>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <ThemeToggle />
        <ScrollToTopButton />
        <div className="min-h-screen pt-16 p-4 safe-area-bottom">
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

  // 对条目按排名排序
  const sortedEntries = [...data.entries].sort((a, b) => a.rank - b.rank);

  const isMetacriticTop250 = chartName === 'Metacritic 史上最佳电影 Top 250' || 
                              chartName === 'Metacritic 史上最佳剧集 Top 250';
  const displayedEntries = isMetacriticTop250 
    ? sortedEntries.slice(0, 250) 
    : sortedEntries;

  return (
    <>
      <NavBar />
      <ThemeToggle />
      <ScrollToTopButton />
      <div className="min-h-screen pt-16 p-4 safe-area-bottom">
        <div ref={contentRef} className="gentle-scroll">
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
                  {data.platform} · 共 {displayedEntries.length} 部作品
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
              {displayedEntries.length >= USE_VIRTUAL_THRESHOLD && gridWidth > 0 && gridHeight > 0 ? (
                <div className="w-full h-[70vh] min-h-[400px]" ref={gridWrapRef}>
                  <Grid
                    columnCount={gridWidth >= 640 ? 10 : 5}
                    rowCount={Math.ceil(displayedEntries.length / (gridWidth >= 640 ? 10 : 5))}
                    columnWidth={(gridWidth - ((gridWidth >= 640 ? 10 : 5) - 1) * GAP) / (gridWidth >= 640 ? 10 : 5)}
                    rowHeight={((gridWidth - ((gridWidth >= 640 ? 10 : 5) - 1) * GAP) / (gridWidth >= 640 ? 10 : 5)) * (3 / 2) + GAP + 24}
                    style={{ width: gridWidth, height: gridHeight }}
                    overscanCount={4}
                    cellComponent={({ columnIndex, rowIndex, style }) => {
                      const colCount = gridWidth >= 640 ? 10 : 5;
                      const idx = rowIndex * colCount + columnIndex;
                      const entry = displayedEntries[idx];
                      if (!entry) return <div style={style} />;
                      const mediaType = entry.media_type || (data.media_type === 'both' ? 'movie' : data.media_type);
                      const linkPath = mediaType === 'movie' ? `/movie/${entry.tmdb_id}` : `/tv/${entry.tmdb_id}`;
                      return (
                        <div style={{ ...style, paddingRight: columnIndex < colCount - 1 ? GAP : 0, paddingBottom: GAP }}>
                          <div className="group relative h-full">
                            <Link to={linkPath} target="_blank" rel="noopener noreferrer">
                              <div className="aspect-[2/3] rounded-lg overflow-hidden relative bg-gray-200 dark:bg-gray-800">
                                {entry.poster ? (
                                  <img src={/^(http|\/api|\/tmdb-images)/.test(entry.poster) ? downscaleTmdb(entry.poster) : `/api/image-proxy?url=${encodeURIComponent(downscaleTmdb(entry.poster))}`} alt={entry.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800"><div className="text-gray-400 text-xs">无海报</div></div>
                                )}
                                <div className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 10 }}>
                                  <div className={`relative ${entry.rank <= 3 ? 'w-8 h-8' : 'w-6 h-6'}`}>
                                    <img src={entry.rank === 1 ? '/laurel-wreath-top1.png' : entry.rank === 2 ? '/laurel-wreath-top2.png' : entry.rank === 3 ? '/laurel-wreath-top3.png' : '/laurel-wreath-other-top.png'} alt="" crossOrigin="anonymous" className="w-full h-full object-contain" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold text-xs" style={{ textShadow: '1px 1px 2px #000' }}>
                                      {chartName === '豆瓣2025评分月度热搜影视' && entry.rank >= 1 && entry.rank <= 12 ? `${entry.rank}月` : entry.rank}
                                    </div>
                                  </div>
                                </div>
                                <div className="absolute top-1 right-1 z-20">
                                  <MiniFavoriteButton mediaId={entry.tmdb_id.toString()} mediaType={mediaType} title={entry.title} poster={entry.poster} className="p-1" />
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-center text-gray-700 dark:text-gray-300 line-clamp-2">{entry.title}</div>
                            </Link>
                          </div>
                        </div>
                      );
                    }}
                    cellProps={{}}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-3" style={{ contain: 'layout style' }} ref={gridWrapRef}>
                  {displayedEntries.map((entry, idx) => {
                    const mediaType = entry.media_type || (data.media_type === 'both' ? 'movie' : data.media_type);
                    const linkPath = mediaType === 'movie' ? `/movie/${entry.tmdb_id}` : `/tv/${entry.tmdb_id}`;
                    return (
                      <div key={`${entry.tmdb_id}-${entry.rank}`} className="group relative" style={{ contain: 'layout style' }}>
                        <Link to={linkPath} target="_blank" rel="noopener noreferrer">
                          <div className="aspect-[2/3] rounded-lg overflow-hidden relative bg-gray-200 dark:bg-gray-800" style={{ transform: 'translateZ(0)' }}>
                            {entry.poster ? (
                              <img
                                src={/^(http|\/api|\/tmdb-images)/.test(entry.poster) ? downscaleTmdb(entry.poster) : `/api/image-proxy?url=${encodeURIComponent(downscaleTmdb(entry.poster))}`}
                                alt={entry.title}
                                className="w-full h-full object-cover transition-opacity duration-200 group-hover:scale-105"
                                loading={idx < 20 ? 'eager' : 'lazy'}
                                fetchPriority={idx < 20 ? 'high' : 'auto'}
                                style={{ willChange: 'transform', minHeight: '100%', display: 'block', opacity: 0, transition: 'opacity 0.2s ease-in, transform 0.2s ease-out' }}
                                decoding="async"
                                sizes="(min-width:1280px) 10vw, (min-width:1024px) 14vw, (min-width:640px) 20vw, 33vw"
                                onLoad={(e) => { const t = e.target as HTMLImageElement; if (t?.complete && t.naturalWidth > 0) requestAnimationFrame(() => { t.style.opacity = '1'; }); }}
                                onError={(e) => { const t = e.target as HTMLImageElement; if (t) t.style.opacity = '0'; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800">
                                <div className="text-gray-400 dark:text-gray-600 text-xs">无海报</div>
                              </div>
                            )}
                            <div className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 10 }}>
                              <div className={`relative ${entry.rank === 1 ? 'w-8 h-8 sm:w-10 h-10' : 'w-6 h-6 sm:w-8 h-8'}`}>
                                <img src={entry.rank === 1 ? '/laurel-wreath-top1.png' : entry.rank === 2 ? '/laurel-wreath-top2.png' : entry.rank === 3 ? '/laurel-wreath-top3.png' : '/laurel-wreath-other-top.png'} alt="" crossOrigin="anonymous" className="w-full h-full object-contain" />
                                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold leading-none whitespace-nowrap ${entry.rank === 1 ? 'text-xs sm:text-base' : 'text-[10px] sm:text-sm'}`} style={{ textShadow: '1px 1px 2px #000000, -1px -1px 2px #000000' }}>
                                  {chartName === '豆瓣2025评分月度热搜影视' && entry.rank >= 1 && entry.rank <= 12 ? `${entry.rank}月` : entry.rank}
                                </div>
                              </div>
                            </div>
                            <div className="absolute top-1 right-1 z-20">
                              <MiniFavoriteButton mediaId={entry.tmdb_id.toString()} mediaType={mediaType} title={entry.title} poster={entry.poster} className="p-1" />
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-center text-gray-700 dark:text-gray-300 line-clamp-2">{entry.title}</div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
