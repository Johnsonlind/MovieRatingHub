// ==========================================
// 剧集详情页
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TVShowHero } from '../components/tv/TVShowHero';
import { Credits } from '../api/Credits';
import { getTVShow } from '../api/tv';
import { messages } from '../utils/messages';
import { exportToPng } from '../utils/export';
import { ExportTVShowRatingCard } from '../components/export/ExportTVShowRatingCard';
import { TVShowMetadata } from '../components/tv/TVShowMetadata';
import { RatingSection } from '../components/ratings/RatingSection';
import { preloadImages } from '../utils/export';
import { fetchTMDBRating, fetchTraktRating } from '../api/ratings';
import type { FetchStatus, BackendPlatformStatus } from '../types/status';
import { ThemeToggle } from '../utils/ThemeToggle';
import { NavBar } from '../utils/NavBar';
import { getBase64Image } from '../api/image';
import { TMDBRating, TraktRating, TVShowRatingData } from '../types/ratings';
import { ExportButton } from '../utils/ExportButton';
import { FavoriteButton } from '../utils/FavoriteButton';
import { ErrorMessage } from '../utils/ErrorMessage';
import { ScrollToTopButton } from '../utils/ScrollToTopButton';

interface PlatformStatus {
  status: FetchStatus;
  data: any;
}

interface PlatformStatuses {
  [key: string]: PlatformStatus;
}

const PRELOAD_IMAGES = [
  `/background.png`,
  `/rating-template.png`,
  `/logos/douban.png`, 
  `/logos/imdb.png`,
  `/logos/letterboxd.png`,
  `/logos/rottentomatoes.png`,
  `/logos/metacritic.png`,
  `/logos/metacritic_audience.png`,
  `/logos/tmdb.png`,
  `/logos/trakt.png`
];

const formatQueryError = (error: unknown): { status: FetchStatus; detail: string } => {
  return {
    status: 'error',
    detail: error instanceof Error ? error.message : String(error)
  };
};

// 页脚组件
const Footer = () => (
  <div className="w-full py-6 mt-8 flex justify-center items-center gap-2">
    <a 
      href="https://weibo.com/u/2238200645" 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
    >
      <img src="/logos/weibo.png" alt="微博" className="w-5 h-5" />
      <span>守望电影</span>
    </a>
  </div>
);

export default function TVShowPage() {
  const { id } = useParams();
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);
  const [tmdbRating, setTmdbRating] = useState<TMDBRating | undefined>(undefined);
  const [traktRating, setTraktRating] = useState<TraktRating | undefined>(undefined);
  
  const [tmdbStatus, setTmdbStatus] = useState<FetchStatus>('pending');
  const [traktStatus, setTraktStatus] = useState<FetchStatus>('pending');
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatuses>({
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

  const [posterBase64, setPosterBase64] = useState<string | null>(null);

  // 添加一个导出专用的状态
  const exportSeasonRef = useRef<number | undefined>(undefined);

  const [retryCount, setRetryCount] = useState<Record<string, number>>({});

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
        // 创建所有后端平台的请求
        const backendPromises = platforms.map(async platform => {
          try {
            const response = await fetch(`/api/ratings/${platform}/tv/${id}`);
            if (!response.ok) throw new Error('获取评分失败');
            const data = await response.json();
            
            // 获取到数据后立即更新状态
            setPlatformStatuses(prev => ({
              ...prev,
              [platform]: {
                status: data.status === 'Successful' ? 'successful' :  
                        data.status === 'No Found' ? 'not_found' :
                        data.status === 'No Rating' ? 'no_rating' :
                        data.status === 'RateLimit' ? 'rate_limit' :
                        data.status === 'Timeout' ? 'timeout' :
                        data.status === 'Fail' ? 'fail' : 'error',
                data
              }
            }));

            return { platform, status: 'successful', data };
          } catch (error) {
            setPlatformStatuses(prev => ({
              ...prev,
              [platform]: { status: 'error', data: null }
            }));
            return { platform, status: 'error', data: null };
          }
        });

        // 获取 TMDB 和 Trakt 评分
        const tmdbPromise = fetchTMDBRating('tv', id!)
          .then(data => {
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
          })
          .catch(() => {
            setTmdbStatus('error');
            setTmdbRating(undefined);
          });
        const traktPromise = fetchTraktRating('shows', id!)
          .then((data: TraktRating | null) => {
            if (!data || !data.rating) {
              setTraktStatus('no_rating'); 
              setTraktRating(undefined);
              return;
            }

            setTraktRating({
              rating: Number(data.rating),
              votes: Number(data.votes || 0),
              distribution: {
                '1': Number(data.distribution?.['1'] || 0),
                '2': Number(data.distribution?.['2'] || 0),
                '3': Number(data.distribution?.['3'] || 0),
                '4': Number(data.distribution?.['4'] || 0),
                '5': Number(data.distribution?.['5'] || 0),
                '6': Number(data.distribution?.['6'] || 0),
                '7': Number(data.distribution?.['7'] || 0),
                '8': Number(data.distribution?.['8'] || 0),
                '9': Number(data.distribution?.['9'] || 0),
                '10': Number(data.distribution?.['10'] || 0)
              },
              seasons: data.seasons?.map(season => ({
                season_number: Number(season.season_number),
                rating: Number(season.rating),
                votes: Number(season.votes || 0),
                distribution: season.distribution
              }))
            });
            setTraktStatus('successful');
          })
          .catch(() => {
            setTraktStatus('error');
            setTraktRating(undefined);
          });

        // 等待所有请求完成，但状态已经在每个请求完成时更新了
        await Promise.all([...backendPromises, tmdbPromise, traktPromise]);

        // 组件卸载时关闭 EventSource
        return () => {
          if (controller.signal.aborted) {
            return;
          }
        };

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

  useEffect(() => {
    preloadImages({
      cdnImages: PRELOAD_IMAGES
    }).catch(error => {
      console.warn('图片预加载失败:', error);
    });
  }, []);

  useEffect(() => {
    if (tvShow) {
      preloadImages({
        poster: tvShow.poster,
        cdnImages: [
          `/background.png`,
          `/rating-template.png`,
          `/logos/douban.png`,
          `/logos/imdb.png`,
          `/logos/letterboxd.png`,
          `/logos/rottentomatoes.png`,
          `/logos/metacritic.png`,
          `/logos/metacritic_audience.png`,
          `/logos/tmdb.png`,
          `/logos/trakt.png`
        ]
      }).catch(error => {
        console.warn('图片预加载失败:', error);
      });
    }
  }, [tvShow]);

  useEffect(() => {
    if (tvShow?.poster) {
      getBase64Image(tvShow.poster)
        .then(base64 => setPosterBase64(base64))
        .catch(error => console.error('Failed to convert poster to base64:', error));
    }
  }, [tvShow]);

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
      logo: `/logos/douban.png`,
      status: platformStatuses.douban.status
    },
    {
      platform: 'imdb',
      logo: `/logos/imdb.png`,
      status: platformStatuses.imdb.status
    },
    {
      platform: 'letterboxd',
      logo: `/logos/letterboxd.png`,
      status: platformStatuses.letterboxd.status
    },
    {
      platform: 'rottentomatoes',
      logo: `/logos/rottentomatoes.png`,
      status: platformStatuses.rottentomatoes.status
    },
    {
      platform: 'metacritic',
      logo: `/logos/metacritic.png`,
      status: platformStatuses.metacritic.status
    }
  ];

  const handleRetry = async (platform: string) => {
    setRetryCount(prev => ({
      ...prev,
      [platform]: (prev[platform] || 0) + 1
    }));

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
        
        setTraktRating({
          rating: Number(data.rating),
          votes: Number(data.votes || data.votes),
          distribution: {
            '1': Number(data.distribution?.['1'] || 0),
            '2': Number(data.distribution?.['2'] || 0),
            '3': Number(data.distribution?.['3'] || 0),
            '4': Number(data.distribution?.['4'] || 0),
            '5': Number(data.distribution?.['5'] || 0),
            '6': Number(data.distribution?.['6'] || 0),
            '7': Number(data.distribution?.['7'] || 0),
            '8': Number(data.distribution?.['8'] || 0),
            '9': Number(data.distribution?.['9'] || 0),
            '10': Number(data.distribution?.['10'] || 0)
          },
          seasons: data.seasons?.map(season => ({
            season_number: Number(season.season_number),
            rating: Number(season.rating),
            votes: Number(season.votes || season.voteCount),
            distribution: season.distribution
          }))
        });
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
            errorDetail: data.error_detail
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

  const handleSeasonChange = async (season: number | undefined) => {
    exportSeasonRef.current = season;
    setSelectedSeason(season);
  };

  const handleExport = async () => {
    const seasonToExport = exportSeasonRef.current;
    
    if (!tvShow || isExporting) return;
    setIsExporting(true);
    
    try {
      const element = document.getElementById('export-content');
      if (!element) throw new Error('导出元素不存在');
      
      let fileName = `${tvShow.title} (${tvShow.year})`;
      if (seasonToExport) {
        fileName += ` S${seasonToExport.toString().padStart(2, '0')}`;
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
    <>
      <NavBar />
      <div className="min-h-screen bg-[var(--page-bg)] pt-16">
        <ThemeToggle />
        <ScrollToTopButton />
        <FavoriteButton 
          mediaId={id || ''}
          mediaType="tv"
          title={tvShow.title || ''}
          poster={`https://image.tmdb.org/t/p/w500${tvShow.backdrop}`}
          year={String(tvShow.year || '')}
          overview={tvShow.overview}
        />
        <ExportButton 
          onExport={handleExport}
          seasons={tvShow?.seasons}
          selectedSeason={selectedSeason}
          onSeasonChange={handleSeasonChange}
          isExporting={isExporting}
        />
      
        <div className="tv-show-content">
          
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

        <div className="fixed left-0 top-0 -z-50 pointer-events-none opacity-0">
          <div id="export-content" className="bg-white">
            {tvShow && (
              <ExportTVShowRatingCard
                tvShow={{
                  ...tvShow,
                  poster: posterBase64 || tvShow.poster
                }}
                ratingData={allRatings}
                selectedSeason={selectedSeason}
              />
            )}
          </div>
        </div>

        <Footer />
        
        {queryError && (
          <ErrorMessage
            status={formatQueryError(queryError).status}
            errorDetail={formatQueryError(queryError).detail}
            onRetry={() => {
              const platformToRetry = backendPlatforms.find(p => p.status === 'error')?.platform || 'unknown';
              handleRetry(platformToRetry);
            }}
            retryCount={retryCount[backendPlatforms.find(p => p.status === 'error')?.platform || 'unknown'] || 0}
          />
        )}
      </div>
    </>
  );
}
