import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { TVShowHero } from '../components/tv/TVShowHero';
import { Credits } from '../components/movie/Credits';
import { BackButton } from '../components/BackButton';
import { getTVShow } from '../lib/api/tmdb/tv';
import { messages } from '../lib/constants/messages';
import { exportToPng } from '../lib/utils/export';
import { ExportTVShowRatingCard } from '../components/export/ExportTVShowRatingCard';
import { TVShowMetadata } from '../components/tv/TVShowMetadata';
import { RatingSection } from '../components/ratings/RatingSection';
import { preloadImages } from '../lib/utils/export';
import { fetchTMDBRating, fetchTraktRating } from '../lib/api/ratings';
import type { FetchStatus, BackendPlatformStatus } from '../types/status';
import { TVShowRatingData } from '../types/ratings';
import { ThemeToggle } from '../components/ThemeToggle';

// 添加 TMDB 和 Trakt 评分类型定义
interface TMDBRating {
  rating: number;
  voteCount: number;
  seasons?: {
    season_number: number;
    rating: number;
    voteCount: number;
  }[];
}

interface TraktRating {
  rating: number;
  votes: number;
  voteCount: number;
  distribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
    '6': number;
    '7': number;
    '8': number;
    '9': number;
    '10': number;
  };
}

interface RatingResult {
  platform: string;
  status: FetchStatus;
  data: any;
}

export default function TVShowPage() {
  const { id } = useParams();
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);
  const [tmdbRating, setTmdbRating] = useState<TMDBRating | undefined>(undefined);
  const [traktRating, setTraktRating] = useState<TraktRating | undefined>(undefined);
  
  const [tmdbStatus, setTmdbStatus] = useState<FetchStatus>('pending');
  const [traktStatus, setTraktStatus] = useState<FetchStatus>('pending');
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, { status: FetchStatus; data: any }>>({
    douban: { status: 'pending', data: null },
    imdb: { status: 'pending', data: null },
    letterboxd: { status: 'pending', data: null },
    rottentomatoes: { status: 'pending', data: null },
    metacritic: { status: 'pending', data: null }
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: tvShow, isLoading, error: queryError } = useQuery({
    queryKey: ['tvshow', id],
    queryFn: () => getTVShow(id!),
    enabled: !!id,
    staleTime: Infinity
  });

  useEffect(() => {
    const fetchAllRatings = async () => {
      // 如果存在之前的请求，先取消它
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // 创建新的 AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      // 设置所有平台为加载状态
      const platforms = ['douban', 'imdb', 'letterboxd', 'rottentomatoes', 'metacritic'];
      platforms.forEach(platform => {
        setPlatformStatuses(prev => ({
          ...prev,
          [platform]: { ...prev[platform], status: 'loading' }
        }));
      });
      setTmdbStatus('loading');
      setTraktStatus('loading');

      try {
        // 创建所有评分请求的 Promise
        const backendPromises = platforms.map(platform => 
          fetch(`/api/ratings/${platform}/tv/${id}`, {
            signal: controller.signal
          })
          .then(response => {
            if (!response.ok) throw new Error('获取评分失败');
            return response.json();
          })
          .then(data => ({
            platform,
            status: data.status === 'Successful' ? 'successful' :  
                    data.status === 'No Found' ? 'not_found' :
                    data.status === 'No Rating' ? 'no_rating' :
                    data.status === 'RateLimit' ? 'rate_limit' :
                    data.status === 'Timeout' ? 'timeout' :
                    data.status === 'Fail' ? 'fail' : 'error',
            data
          }))
          .catch(error => {
            if (error.name === 'AbortError') {
              throw error;
            }
            return {
              platform,
              status: 'error',
              data: null
            };
          })
        );


      // 等待所有请求完成并更新状态
      const tmdbPromise = fetchTMDBRating('tv', id!)
        .then(data => {
          if (!data || !data.rating) {
            setTmdbStatus('no_rating');
            setTmdbRating(undefined);
            return;
          }
          
          // 确保类型转换正确
          const tmdbData: TMDBRating = {
            rating: Number(data.rating),
            voteCount: Number(data.voteCount),
            seasons: data.seasons?.map(s => ({
              season_number: Number(s.season_number),
              rating: Number(s.rating),
              voteCount: Number(s.voteCount)
            }))
          };
          
          setTmdbRating(tmdbData);
          setTmdbStatus('successful');
        })
        .catch(() => {
          setTmdbStatus('error');
          setTmdbRating(undefined);
        });
        const traktPromise = fetchTraktRating('shows', id!)
        .then(data => {
          if (!data || !data.rating) {
            setTraktStatus('no_rating');
            setTraktRating(undefined);
            return;
          }
          const traktData: TraktRating = {
            rating: Number(data.rating),
            votes: Number(data.voteCount),
            voteCount: Number(data.voteCount),
            distribution: {
              '1': Number(data.distribution['1'] || 0),
              '2': Number(data.distribution['2'] || 0),
              '3': Number(data.distribution['3'] || 0),
              '4': Number(data.distribution['4'] || 0),
              '5': Number(data.distribution['5'] || 0),
              '6': Number(data.distribution['6'] || 0),
              '7': Number(data.distribution['7'] || 0),
              '8': Number(data.distribution['8'] || 0),
              '9': Number(data.distribution['9'] || 0),
              '10': Number(data.distribution['10'] || 0)
            }
          };
          setTraktRating(traktData);
          setTraktStatus('successful');
        })
        .catch(() => {
          setTraktStatus('error');
          setTraktRating(undefined);
        });

        const results = await Promise.allSettled([
          ...backendPromises,
          tmdbPromise,
          traktPromise
        ]);

        if (controller.signal.aborted) {
          return;
        }

        // 处理后端平台的结果
        results.slice(0, platforms.length).forEach((result) => {
          if (result.status === 'fulfilled') {
            const value = result.value as RatingResult;
            setPlatformStatuses(prev => ({
              ...prev,
              [value.platform]: { status: value.status, data: value.data }
            }));
          }
        });
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name !== 'AbortError') {
          console.error('获取评分失败:', error);
        }
      }
    };

    fetchAllRatings();

    // 清理函数
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id]);

  // 组合所有评分数据
  const allRatings: TVShowRatingData = {
    type: 'tv',
    douban: platformStatuses.douban.data,
    imdb: platformStatuses.imdb.data,
    letterboxd: platformStatuses.letterboxd.data,
    rottentomatoes: platformStatuses.rottentomatoes.data,
    metacritic: platformStatuses.metacritic.data,
    tmdb: tmdbRating || undefined,
    trakt: traktRating || undefined
  };

  const backendPlatforms: BackendPlatformStatus[] = [
    {
      platform: 'douban',
      logo: '/logos/douban.png',
      status: platformStatuses.douban.status
    },
    {
      platform: 'imdb',
      logo: '/logos/imdb.png',
      status: platformStatuses.imdb.status
    },
    {
      platform: 'letterboxd',
      logo: '/logos/letterboxd.png',
      status: platformStatuses.letterboxd.status
    },
    {
      platform: 'rottentomatoes',
      logo: '/logos/rottentomatoes_critics.png',
      status: platformStatuses.rottentomatoes.status
    },
    {
      platform: 'metacritic',
      logo: '/logos/metacritic.png',
      status: platformStatuses.metacritic.status
    }
  ];

  const handleRetry = async (platform: string) => {
    if (platform === 'tmdb') {
      setTmdbStatus('loading');
      try {
        const data = await fetchTMDBRating('tv', id!);
        if (!data || !data.rating) {
          setTmdbStatus('no_rating');
          setTmdbRating(undefined);
          return;
        }
        
        const tmdbData: TMDBRating = {
          rating: Number(data.rating),
          voteCount: Number(data.voteCount),
          seasons: data.seasons?.map(s => ({
            season_number: Number(s.season_number),
            rating: Number(s.rating),
            voteCount: Number(s.voteCount)
          }))
        };
        
        setTmdbRating(tmdbData);
        setTmdbStatus('successful');
      } catch (error) {
        setTmdbStatus('error');
        setTmdbRating(undefined);
      }
    } else if (platform === 'trakt') {
      setTraktStatus('loading');
      try {
        const data = await fetchTraktRating('shows', id!);
        if (!data || !data.rating) {
          setTraktStatus('no_rating');
          setTraktRating(undefined);
          return;
        }
        
        const traktData: TraktRating = {
          rating: Number(data.rating),
          votes: Number(data.voteCount),
          voteCount: Number(data.voteCount),
          distribution: {
            '1': Number(data.distribution['1'] || 0),
            '2': Number(data.distribution['2'] || 0),
            '3': Number(data.distribution['3'] || 0),
            '4': Number(data.distribution['4'] || 0),
            '5': Number(data.distribution['5'] || 0),
            '6': Number(data.distribution['6'] || 0),
            '7': Number(data.distribution['7'] || 0),
            '8': Number(data.distribution['8'] || 0),
            '9': Number(data.distribution['9'] || 0),
            '10': Number(data.distribution['10'] || 0)
          }
        };
        
        setTraktRating(traktData);
        setTraktStatus('successful');
      } catch (error) {
        setTraktStatus('error');
        setTraktRating(undefined);
      }
    } else {
      setPlatformStatuses(prev => ({
        ...prev,
        [platform]: { ...prev[platform], status: 'loading' }
      }));
      
      try {
        const response = await fetch(`/api/ratings/${platform}/tv/${id}`);
        if (!response.ok) throw new Error('获取评分失败');
        const data = await response.json();
        
        // 根据后端返回的状态设置前端状态
        const frontendStatus = data.status === 'Successful' ? 'successful' :  
                              data.status === 'No Found' ? 'not_found' :
                              data.status === 'No Rating' ? 'no_rating' :
                              data.status === 'RateLimit' ? 'rate_limit' :
                              data.status === 'Timeout' ? 'timeout' :
                              data.status === 'Fail' ? 'fail' : 'error';
        
        setPlatformStatuses(prev => ({
          ...prev,
          [platform]: {
            status: frontendStatus, 
            data,
            errorDetail: data.error_detail // 保存错误详情
          }
        }));
      } catch (error) {
        setPlatformStatuses(prev => ({
          ...prev,
          [platform]: { status: 'error', data: null }
        }));
      }
    }
  };

  const handleExport = async () => {
    if (!tvShow || isExporting) return;
    
    setIsExporting(true);
    
    try {
      // 预加载图片
      await preloadImages([
        tvShow.poster,
        '/rating-template.png',
        '/logos/douban.png',
        '/logos/imdb.png',
        '/logos/letterboxd.png',
        '/logos/rottentomatoes_critics.png',
        '/logos/metacritic.png',
        '/logos/tmdb.png',
        '/logos/trakt.png'
      ]);
      
      const element = document.getElementById('export-content');
      if (!element) throw new Error('导出元素不存在');
      
      // 构建文件名：标题+年份，如果是分季则加上季数
      let fileName = `${tvShow.title} (${tvShow.year})`;
      if (selectedSeason) {
        fileName += ` S${selectedSeason.toString().padStart(2, '0')}`;
      }
      fileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');
      
      await exportToPng(element, `${fileName}.png`);
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const episodeCount = tvShow?.seasons?.reduce((total, season) => 
    total + (season.episodeCount || 0), 0) || 0;

  const seasonCount = tvShow?.seasons?.filter(season => 
    season.seasonNumber > 0).length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (queryError || !tvShow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Error</h2>
          <p className="text-gray-600 dark:text-gray-400">{messages.errors.loadMovieFailed}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <BackButton />
      <ThemeToggle />
      
      <div className="tv-show-content">
        {/* 添加调试日志 */}
        {(() => {
          console.log('TVShow Data:', {
            tvShow,
            genres: tvShow?.genres,
            status: tvShow?.status,
            firstAirDate: tvShow?.firstAirDate,
            lastAirDate: tvShow?.lastAirDate,
            episodeCount,
            seasonCount,
          });
          return null;
        })()}
        
        <TVShowHero 
          tvShow={tvShow} 
          backdropUrl={tvShow.backdrop}
          ratingData={allRatings}
          isAllDataFetched={backendPlatforms.filter(p => 
            p.status === 'successful'
          ).length >= 2 || (
            tmdbStatus === 'successful' && 
            traktStatus === 'successful'
          )}
        />
        <TVShowMetadata
          status={tvShow?.status || ''}
          firstAirDate={tvShow?.firstAirDate || ''}
          lastAirDate={tvShow?.lastAirDate || ''}
          episodeCount={episodeCount}
          seasonCount={seasonCount}
          genres={tvShow?.genres || []}
        />
        
        {/* 评分部分 */}
        <RatingSection 
          media={tvShow}
          ratingData={allRatings}
          isLoading={false}
          error={undefined}
          tmdbStatus={tmdbStatus}
          traktStatus={traktStatus}
          backendPlatforms={backendPlatforms}
          onRetry={handleRetry}
        />

        <Credits
          cast={tvShow.credits.cast}
          crew={tvShow.credits.crew}
        />
      </div>

      {/* Export Content */}
      <div className="fixed left-0 top-0 -z-50 pointer-events-none">
        <div id="export-content" className="bg-white">
          {tvShow && (
            <ExportTVShowRatingCard 
              tvShow={tvShow}
              ratingData={allRatings}
              selectedSeason={selectedSeason}
            />
          )}
        </div>
      </div>
      
      <div className="fixed bottom-8 right-8 flex flex-col gap-2">
        {tvShow?.seasons && tvShow.seasons.length > 0 && (
          <select
            value={selectedSeason || ''}
            onChange={(e) => setSelectedSeason(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm"
            disabled={isExporting}
          >
            <option value="">导出整部剧集评分</option>
            {tvShow.seasons.map((season) => (
              <option key={season.seasonNumber} value={season.seasonNumber}>
                导出第 {season.seasonNumber} 季评分
              </option>
            ))}
          </select>
        )}
        
        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="export-button bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-colors"
        >
          <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
          {isExporting ? '导出中...' : '导出评分卡片'}
        </button>
      </div>
    </div>
  );
}
