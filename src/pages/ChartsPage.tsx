// ==========================================
// 榜单页面
// ==========================================
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { NavBar } from '../components/ui/NavBar';
import { ScrollToTopButton } from '../components/ui/ScrollToTopButton';
import { Link } from 'react-router-dom';
import { MiniFavoriteButton } from '../components/ui/MiniFavoriteButton';
import { exportToPng } from '../utils/export';
import { Download } from 'lucide-react';
import { ExportChartCard } from '../components/export/ExportChartCard';
import { useAggressiveImagePreload } from '../hooks/useAggressiveImagePreload';
import { Footer } from '../components/common/Footer';

const downscaleTmdb = (url: string) => {
  const tmdbPattern = /https?:\/\/image\.tmdb\.org\/t\/p\/(original|w\d+)(\/.+)/;
  const match = url.match(tmdbPattern);
  if (match) {
    return `https://image.tmdb.org/t/p/w342${match[2]}`;
  }
  if (url.startsWith('/tmdb-images/')) {
    return url.replace(/\/tmdb-images\/(original|w\d+)\//, '/tmdb-images/w342/');
  }
  return url;
};

const resolvePosterUrl = (poster: string) =>
  /^(http|\/api|\/tmdb-images)/.test(poster)
    ? downscaleTmdb(poster)
    : `/api/image-proxy?url=${encodeURIComponent(downscaleTmdb(poster))}`;

// 榜单顺序
const CHART_ORDER = ['豆瓣', 'IMDb', 'Rotten Tomatoes', 'Metacritic', 'Letterboxd', 'TMDB', 'Trakt'];

// 各平台的榜单顺序配置
const PLATFORM_CHART_ORDER: Record<string, string[]> = {
  '豆瓣': [
    '一周口碑榜',
    '一周华语剧集口碑榜',
    '一周全球剧集口碑榜',
    '豆瓣2025评分最高华语电影',
    '豆瓣2025评分最高外语电影',
    '豆瓣2025冷门佳片',
    '豆瓣2025评分最高日本电影',
    '豆瓣2025评分最高韩国电影',
    '豆瓣2025评分最高喜剧片',
    '豆瓣2025评分最高爱情片',
    '豆瓣2025评分最高恐怖片',
    '豆瓣2025评分最高动画片',
    '豆瓣2025评分最高纪录片',
    '豆瓣2026最值得期待华语电影',
    '豆瓣2026最值得期待外语电影',
    '豆瓣2025评分最高华语剧集',
    '豆瓣2025评分最高英美新剧',
    '豆瓣2025评分最高英美续订剧',
    '豆瓣2025评分最高日本剧集',
    '豆瓣2025评分最高韩国剧集',
    '豆瓣2025评分最受关注综艺', 
    '豆瓣2025评分最高动画剧集',
    '豆瓣2025评分最高大陆微短剧',
    '豆瓣2025评分最高纪录剧集',
    '豆瓣2026最值得期待剧集',
    '豆瓣2025评分月度热搜影视',
    '豆瓣 电影 Top 250',
  ],
  'IMDb': [
    'IMDb 本周 Top 10',
    'IMDb 2025最受欢迎电影',
    'IMDb 2025最受欢迎剧集',
    'IMDb 工作人员2025最喜爱的电影',
    'IMDb 工作人员2025最喜爱的剧集',
    'IMDb 电影 Top 250',
    'IMDb 剧集 Top 250',
  ],
  'Rotten Tomatoes': [
    '热门流媒体电影',
    '热门剧集',
    'Rotten Tomatoes 2025 最佳电影',
    'Rotten Tomatoes 2025 最佳剧集',
  ],
  'Metacritic': [
    '本周趋势电影',
    '本周趋势剧集',
    'Metacritic 2025 最佳电影',
    'Metacritic 2025 最佳剧集',
    'Metacritic 史上最佳电影 Top 250',
    'Metacritic 史上最佳剧集 Top 250',
  ],
  'Letterboxd': [
    '本周热门影视',
    'Letterboxd 2025 Top 50',
    'Letterboxd 电影 Top 250',
  ],
  'TMDB': [
    '本周趋势影视',
    'TMDB 高分电影 Top 250',
    'TMDB 高分剧集 Top 250',
  ],
  'Trakt': [
    '上周电影 Top 榜',
    '上周剧集 Top 榜',
  ],
};

// 平台名称映射（后端返回的名称 → 前端显示的名称）
const PLATFORM_NAME_MAP: Record<string, string> = {
  '烂番茄': 'Rotten Tomatoes',
  'MTC': 'Metacritic',
};

// 榜单名称映射（后端返回的名称 → 前端显示的名称）
const CHART_NAME_MAP: Record<string, string> = {
  // 豆瓣
  '豆瓣 Top 250': '豆瓣 电影 Top 250',
  // IMDb
  'Top 10 on IMDb this week': 'IMDb 本周 Top 10',
  'IMDb Top 250 Movies': 'IMDb 电影 Top 250',
  'IMDb Top 250 TV Shows': 'IMDb 剧集 Top 250',
  // Rotten Tomatoes
  'Popular Streaming Movies': '热门流媒体电影',
  'Popular TV': '热门剧集',
  // Metacritic
  'Trending Movies This Week': '本周趋势电影',
  'Trending Shows This Week': '本周趋势剧集',
  'Metacritic Best Movies of All Time': 'Metacritic 史上最佳电影 Top 250',
  'Metacritic Best TV Shows of All Time': 'Metacritic 史上最佳剧集 Top 250',
  // Letterboxd
  'Popular films this week': '本周热门影视',
  'Letterboxd Official Top 250': 'Letterboxd 电影 Top 250',
  // TMDB
  '趋势本周': '本周趋势影视',
  'TMDB Top 250 Movies': 'TMDB 高分电影 Top 250',
  'TMDB Top 250 TV Shows': 'TMDB 高分剧集 Top 250',
  // Trakt
  'Top TV Shows Last Week': '上周剧集 Top 榜',
  'Top Movies Last Week': '上周电影 Top 榜',
};

// 不可导出的榜单列表
const NON_EXPORTABLE_CHARTS = [
  '豆瓣 电影 Top 250',
  'IMDb 工作人员2025最喜爱的电影',
  'IMDb 工作人员2025最喜爱的剧集',
  'IMDb 电影 Top 250',
  'IMDb 剧集 Top 250',
  'Letterboxd 2025 Top 50',
  'Letterboxd 电影 Top 250',
  'Metacritic 史上最佳电影 Top 250',
  'Metacritic 史上最佳剧集 Top 250',
  'TMDB 高分电影 Top 250',
  'TMDB 高分剧集 Top 250',
  'Rotten Tomatoes 2025 最佳电影',
  'Rotten Tomatoes 2025 最佳剧集',
  'Metacritic 2025 最佳电影',
  'Metacritic 2025 最佳剧集',
];

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

interface ChartSection {
  platform: string;
  chart_name: string;
  media_type: 'movie' | 'tv' | 'both';
  entries: ChartEntry[];
}

export default function ChartsPage() {
  useEffect(() => {
    document.title = '榜单 - RateFuse';
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);

  const isSafariMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod/.test(ua) || 
                    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua) || 
                     (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);
    return isMobile && isSafari;
  }, []);

  const { data: chartsData, isLoading } = useQuery({
    queryKey: ['public-charts'],
    queryFn: async () => {
      const response = await fetch('/api/charts/public');
      if (!response.ok) {
        throw new Error('获取榜单数据失败');
      }
      const data = await response.json() as ChartSection[];
      return data.map(chart => ({
        ...chart,
        platform: PLATFORM_NAME_MAP[chart.platform] || chart.platform,
        chart_name: CHART_NAME_MAP[chart.chart_name] || chart.chart_name,
      }));
    },
    placeholderData: (previousData) => previousData,
  });

  useAggressiveImagePreload(contentRef, !isLoading && !!chartsData && !isSafariMobile);

  const sortedCharts = useMemo(() => {
    if (!chartsData) return [];
    return CHART_ORDER.flatMap(platform => 
      chartsData.filter(chart => chart.platform === platform)
    ).concat(
      chartsData.filter(chart => !CHART_ORDER.includes(chart.platform))
    );
  }, [chartsData]);

  const chartsByPlatform = useMemo(() => {
    const result = sortedCharts.reduce((acc, chart) => {
    const platformKey = chart.platform;
    
    const shouldMerge = chart.platform === 'TMDB' || 
                       chart.platform === 'IMDb' || 
                       chart.chart_name === '豆瓣2025评分月度热搜影视';
    
    if (shouldMerge) {
      if (acc[platformKey] && acc[platformKey].length > 0) {
        const existingChart = acc[platformKey].find(c => c.chart_name === chart.chart_name);
        if (existingChart) {
          const existingIds = new Set(existingChart.entries.map(e => `${e.tmdb_id}-${e.rank}`));
          chart.entries.forEach(entry => {
            const entryKey = `${entry.tmdb_id}-${entry.rank}`;
            if (!existingIds.has(entryKey)) {
              existingChart.entries.push(entry);
              existingIds.add(entryKey);
            }
          });
          existingChart.entries.sort((a, b) => a.rank - b.rank);
          existingChart.media_type = 'both';
          return acc;
        }
      }
      const mergedChart = { ...chart, media_type: 'both' as const };
      if (!acc[platformKey]) {
        acc[platformKey] = [];
      }
      acc[platformKey].push(mergedChart);
      return acc;
    }
    
    if (!acc[platformKey]) {
      acc[platformKey] = [];
    }
      acc[platformKey].push(chart);
      return acc;
    }, {} as Record<string, ChartSection[]>);

    // 对所有平台的榜单进行排序
    Object.keys(result).forEach(platform => {
      if (result[platform]) {
        const platformOrder = PLATFORM_CHART_ORDER[platform];
        
        if (platformOrder) {
          // 如果有自定义顺序，按照自定义顺序排序
          result[platform].sort((a, b) => {
            const indexA = platformOrder.indexOf(a.chart_name);
            const indexB = platformOrder.indexOf(b.chart_name);
            
            // 两个都在自定义顺序中
            if (indexA !== -1 && indexB !== -1) {
              return indexA - indexB;
            }
            // 只有 a 在自定义顺序中
            if (indexA !== -1) return -1;
            // 只有 b 在自定义顺序中
            if (indexB !== -1) return 1;
            // 都不在自定义顺序中，按名称排序
            return a.chart_name.localeCompare(b.chart_name);
          });
        } else {
          // 没有自定义顺序，使用默认排序（按名称）
          result[platform].sort((a, b) => a.chart_name.localeCompare(b.chart_name));
        }
      }
    });

    return result;
  }, [sortedCharts]);

  const [visiblePlatforms, setVisiblePlatforms] = useState<string[]>([]);
  
  useEffect(() => {
    if (!chartsByPlatform) return;
    
    const platforms = Object.keys(chartsByPlatform);
    
    if (isSafariMobile) {
      setVisiblePlatforms(platforms.slice(0, 1));
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const platform = entry.target.getAttribute('data-platform');
              if (platform) {
                setVisiblePlatforms((prev) => {
                  if (!prev.includes(platform)) {
                    return [...prev, platform];
                  }
                  return prev;
                });
              }
            }
          });
        },
        {
          rootMargin: '200px',
        }
      );

      const timer = setTimeout(() => {
        platforms.slice(1).forEach((platform) => {
          const placeholder = document.getElementById(`platform-placeholder-${platform}`);
          if (placeholder) {
            observer.observe(placeholder);
          }
        });
      }, 100);

      return () => {
        clearTimeout(timer);
        observer.disconnect();
      };
    } else {
      setVisiblePlatforms(platforms);
    }
  }, [isSafariMobile, chartsByPlatform]);

  const [exportingChart, setExportingChart] = useState<string | null>(null);
  const [activeExportChart, setActiveExportChart] = useState<{
    platform: string;
    chartName: string;
    chartKey: string;
    layout: 'portrait' | 'landscape';
  } | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const handleExportChart = useCallback(async (platform: string, chartName: string, chartKey: string, layout: 'portrait' | 'landscape' = 'portrait') => {
    const exportKey = `${chartKey}-${layout}`;
    if (exportingChart === exportKey) return;

    setExportingChart(exportKey);
    
    // 设置要导出的榜单信息，触发渲染
    setActiveExportChart({ platform, chartName, chartKey, layout });

    // 等待 DOM 更新
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => resolve(null), 100);
        });
      });
    });
    
    try {
      const element = exportRef.current;
      if (!element) {
        console.error('导出元素未找到');
        return;
      }

      const chart = sortedCharts?.find(c => 
        c.platform === platform && c.chart_name === chartName
      );
      
      if (chart && element) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                        (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));

        const maxConcurrent = isMobile ? 3 : 8;
        const timeout = isMobile ? 3000 : 5000;
        
        const { getBase64Image } = await import('../api/image');
        
        const entriesToConvert = chart.entries
          .sort((a, b) => a.rank - b.rank)
          .filter(entry => entry.poster && entry.poster.trim() !== '');

        for (let i = 0; i < entriesToConvert.length; i += maxConcurrent) {
          const batch = entriesToConvert.slice(i, i + maxConcurrent);
          
          const batchPromises = batch.map(async (entry) => {
            try {
              const base64 = await getBase64Image(entry.poster!);
              
              const images = element.getElementsByTagName('img');
              for (let j = 0; j < images.length; j++) {
                const img = images[j];
                if (img.getAttribute('alt') === entry.title) {
                  img.src = base64;
                  await new Promise<void>((resolve) => {
                    if (img.complete && img.naturalWidth > 0) {
                      resolve();
                    } else {
                      img.onload = () => resolve();
                      img.onerror = () => resolve();
                      setTimeout(() => resolve(), timeout);
                    }
                  });
                  break;
                }
              }
            } catch (error) {
              console.warn(`海报转换失败 (${entry.title}):`, error);
            }
          });
          
          await Promise.all(batchPromises);

          if (isMobile && i + maxConcurrent < entriesToConvert.length) {
            await new Promise(resolve => {
              requestAnimationFrame(() => {
                setTimeout(() => resolve(null), 0);
              });
            });
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        }
      }

      await new Promise(resolve => {
        requestAnimationFrame(() => {
          setTimeout(() => resolve(null), 0);
        });
      });

      const images = element.getElementsByTagName('img');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
      const timeout = isMobile ? 3000 : 5000;
      
      const imagePromises = Array.from(images).map(img => {
        if (img.complete && img.naturalWidth > 0) {
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), timeout);
        });
      });
      
      await Promise.all(imagePromises);
      await new Promise(resolve => setTimeout(resolve, isMobile ? 100 : 200));

      const fileName = `${platform}-${chartName}`.replace(/[/\\?%*:|"<>]/g, '-');
      await exportToPng(element, `${fileName}.png`, { isChart: true });
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setExportingChart(null);
      setActiveExportChart(null);
    }
  }, [sortedCharts, exportingChart]);

  return (
    <>
      <NavBar />
      <ThemeToggle />
      <ScrollToTopButton />
      <div className="min-h-screen pt-16 p-4 safe-area-bottom">
        <div ref={contentRef} className="gentle-scroll">
        <div className="max-w-7xl mx-auto space-y-8 pt-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-600 dark:text-gray-400">加载中...</div>
            </div>
          ) : sortedCharts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-600 dark:text-gray-400">
                暂无榜单数据
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {CHART_ORDER.map(platform => {
                const platformCharts = chartsByPlatform[platform] || [];
                if (platformCharts.length === 0) return null;
                
                if (isSafariMobile && !visiblePlatforms.includes(platform)) {
                  return (
                    <div
                      key={`placeholder-${platform}`}
                      id={`platform-placeholder-${platform}`}
                      data-platform={platform}
                      className="glass-card rounded-2xl p-6"
                      style={{ minHeight: '200px' }}
                    >
                      <div className="flex items-center gap-3 mb-6">
                        {PLATFORM_LOGOS[platform] && (
                          <img 
                            src={PLATFORM_LOGOS[platform]} 
                            alt={platform}
                            className="w-8 h-8 object-contain"
                          />
                        )}
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                          {platform}
                        </h2>
                      </div>
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        加载中...
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={platform} className="glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                      {PLATFORM_LOGOS[platform] && (
                        <img 
                          src={PLATFORM_LOGOS[platform]} 
                          alt={platform}
                          className="w-8 h-8 object-contain"
                        />
                      )}
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {platform}
                      </h2>
                    </div>
                    <div className="space-y-6">
                      {platformCharts.map((chart, idx) => {
                        const chartKey = `${chart.platform}-${chart.chart_name}-${idx}`;
                        const sortedEntries = [...chart.entries].sort((a, b) => a.rank - b.rank);
                        
                        const isNonExportable = NON_EXPORTABLE_CHARTS.includes(chart.chart_name);
                        const maxDisplayEntries = isSafariMobile ? 10 : Infinity;
                        const displayEntries = isNonExportable 
                          ? sortedEntries.slice(0, 10) 
                          : sortedEntries.slice(0, maxDisplayEntries);
                        
                        return (
                        <div key={chartKey}>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                              {chart.chart_name}
                            </h3>
                            {isNonExportable ? (
                              <Link
                                to={`/charts/${encodeURIComponent(chart.platform)}/${encodeURIComponent(chart.chart_name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="glass-button px-3 py-1.5 text-sm flex items-center gap-2 text-gray-800 dark:text-white hover:scale-105 transition-all"
                              >
                                更多
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleExportChart(chart.platform, chart.chart_name, chartKey, 'portrait')}
                                  disabled={exportingChart === `${chartKey}-portrait` || exportingChart === `${chartKey}-landscape`}
                                  className="glass-button px-3 py-1.5 text-sm flex items-center gap-2 text-gray-800 dark:text-white hover:scale-105 transition-all"
                                  title="竖版导出"
                                >
                                  <Download className="w-4 h-4" />
                                  {exportingChart === `${chartKey}-portrait` ? '导出中...' : '竖版'}
                                </button>
                                <button
                                  onClick={() => handleExportChart(chart.platform, chart.chart_name, chartKey, 'landscape')}
                                  disabled={exportingChart === `${chartKey}-portrait` || exportingChart === `${chartKey}-landscape`}
                                  className="glass-button px-3 py-1.5 text-sm flex items-center gap-2 text-gray-800 dark:text-white hover:scale-105 transition-all"
                                  title="横版导出"
                                >
                                  <Download className="w-4 h-4" />
                                  {exportingChart === `${chartKey}-landscape` ? '导出中...' : '横版'}
                                </button>
                              </div>
                            )}
                          </div>
                          {chart.entries.length === 0 ? (
                            <div className="text-gray-500 dark:text-gray-400 text-sm">
                              暂无数据
                            </div>
                          ) : (
                            <>
                              {/* 显示用的网格 */}
                              <div className="grid grid-cols-5 sm:grid-cols-10 gap-3" style={{ contain: 'layout style' }}>
                                {displayEntries.map((entry, idx) => {
                                    const mediaType = entry.media_type || 
                                      (chart.media_type === 'both' ? 'movie' : chart.media_type);
                                    const linkPath = mediaType === 'movie' 
                                      ? `/movie/${entry.tmdb_id}` 
                                      : `/tv/${entry.tmdb_id}`;
                                    
                                    const shouldUseEager = !isSafariMobile && idx < 20;
                                    const fetchPriorityValue = isSafariMobile 
                                      ? (idx < 5 ? 'high' : 'low')
                                      : (idx < 20 ? 'high' : idx < 60 ? 'auto' : 'low');
                                    
                                    return (
                                      <div key={`${entry.tmdb_id}-${entry.rank}`} className="group relative" style={{ contain: 'layout style' }}>
                                        <Link to={linkPath} target="_blank" rel="noopener noreferrer">
                                          <div className="aspect-[2/3] rounded-lg overflow-hidden relative bg-gray-200 dark:bg-gray-800" style={{ transform: 'translateZ(0)' }}>
                                            {entry.poster ? (
                                              <img
                                                src={resolvePosterUrl(entry.poster)}
                                                alt={entry.title}
                                                className="w-full h-full object-cover transition-opacity duration-200"
                                                loading={shouldUseEager ? "eager" : "lazy"}
                                                fetchPriority={fetchPriorityValue}
                                                decoding="async"
                                                sizes="(min-width:1280px) 10vw, (min-width:1024px) 14vw, (min-width:640px) 20vw, 33vw"
                                                style={{ 
                                                  minHeight: '100%',
                                                  display: 'block',
                                                  opacity: 0,
                                                  transition: 'opacity 0.2s ease-in'
                                                }}
                                                onLoad={(e) => {
                                                  const target = e.target as HTMLImageElement;
                                                  if (target && target.complete && target.naturalWidth > 0) {
                                                    requestAnimationFrame(() => {
                                                      target.style.opacity = '1';
                                                    });
                                                  }
                                                }}
                                                onError={(e) => {
                                                  const target = e.target as HTMLImageElement;
                                                  if (target) {
                                                    target.style.opacity = '0';
                                                  }
                                                }}
                                              />
                                            ) : (
                                              <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800">
                                                <div className="text-gray-400 dark:text-gray-600 text-xs">无海报</div>
                                              </div>
                                            )}
                                            {/* 排名标签 - 圆环 */}
                                            <div className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 10 }}>
                                              <div className={`relative ${entry.rank === 1 ? 'w-8 h-8 sm:w-10 h-10' : 'w-6 h-6 sm:w-8 h-8'}`}>
                                                <img
                                                  src={
                                                    entry.rank === 1 ? '/laurel-wreath-top1.png' :
                                                    entry.rank === 2 ? '/laurel-wreath-top2.png' :
                                                    entry.rank === 3 ? '/laurel-wreath-top3.png' :
                                                    '/laurel-wreath-other-top.png'
                                                  }
                                                  alt=""
                                                  crossOrigin="anonymous"
                                                  className="w-full h-full object-contain"
                                                />
                                                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold leading-none whitespace-nowrap ${
                                                  entry.rank === 1 ? 'text-xs sm:text-base' : 'text-[10px] sm:text-sm'
                                                }`}
                                                style={{
                                                  textShadow: '1px 1px 2px #000000, -1px -1px 2px #000000, 1px -1px 2px #000000, -1px 1px 2px #000000'
                                                }}>
                                                  {chart.chart_name === '豆瓣2025评分月度热搜影视' && entry.rank >= 1 && entry.rank <= 12
                                                    ? `${entry.rank}月`
                                                    : entry.rank}
                                                </div>
                                              </div>
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
                            </>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
        <Footer />
      </div>

      {/* 按需渲染的导出容器 - 只在导出时创建 */}
      {activeExportChart && (() => {
        const chart = sortedCharts?.find(c => 
          c.platform === activeExportChart.platform && 
          c.chart_name === activeExportChart.chartName
        );
        
        if (!chart) return null;
        
        return (
          <div className="fixed left-0 top-0 -z-50 pointer-events-none opacity-0">
            <div ref={exportRef}>
              <ExportChartCard 
                platform={chart.platform}
                chartName={chart.chart_name}
                entries={chart.entries.sort((a, b) => a.rank - b.rank)}
                platformLogo={PLATFORM_LOGOS[chart.platform]}
                layout={activeExportChart.layout}
              />
            </div>
          </div>
        );
      })()}
    </>
  );
}
