import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { MovieHero } from '../components/movie/MovieHero';
import { Credits } from '../components/movie/Credits';
import { BackButton } from '../components/BackButton';
import { getMovie } from '../lib/api/tmdb/movies';
import { messages } from '../lib/constants/messages';
import { exportToPng } from '../lib/utils/export';
import { ExportRatingCard } from '../components/export/ExportRatingCard';
import { MovieMetadata } from '../components/movie/MovieMetadata';
import { RatingSection } from '../components/ratings/RatingSection';
import { preloadImages } from '../lib/utils/export';
import { fetchTMDBRating, fetchTraktRating } from '../lib/api/ratings';
import type { FetchStatus, BackendPlatformStatus } from '../types/status';
import { TMDBRating, TraktRating, MovieRatingData } from '../types/ratings';
import { Movie as MediaMovie } from '../types/media';
import { ThemeToggle } from '../components/ThemeToggle';

interface PlatformStatus {
  status: FetchStatus;
  data: any;
}

interface PlatformStatuses {
  [key: string]: PlatformStatus;
}

export default function MoviePage() {
  const { id } = useParams();
  const [isExporting, setIsExporting] = useState(false);
  const [tmdbRating, setTmdbRating] = useState<TMDBRating | null>(null);
  const [traktRating, setTraktRating] = useState<TraktRating | null>(null);
  
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

  const { data: movie, isLoading, error } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => getMovie(id!),
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
          fetch(`/api/ratings/${platform}/movie/${id}`, {
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
        const tmdbPromise = fetchTMDBRating('movie', id!)
          .then(data => {
            if (!data || !data.rating) {
              setTmdbStatus('no_rating');
              setTmdbRating(null);
              return;
            }
            const tmdbData: TMDBRating = {
              rating: Number(data.rating),
              voteCount: Number(data.voteCount)
            };
            setTmdbRating(tmdbData);
            setTmdbStatus('successful');
          })
          .catch(() => {
            setTmdbStatus('error');
            setTmdbRating(null);
          });

          const traktPromise = fetchTraktRating('movies', id!)
          .then(data => {
            if (!data || !data.rating) {
              setTraktStatus('no_rating');
              setTraktRating(null);
              return;
            }
            setTraktRating({
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
            });
            setTraktStatus('successful');
          })
          .catch(() => {
            setTraktStatus('error');
            setTraktRating(null);
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
          if (result.status === 'fulfilled' && result.value) {
            const { platform, status, data } = result.value as {
              platform: string;
              status: string;
              data: any;
            };
            setPlatformStatuses(prev => ({
              ...prev,
              [platform]: { 
                status: status as FetchStatus, 
                data 
              }
            }));
          }
        });
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name !== 'AbortError') {
          console.error('获取评分失败:', error);
          platforms.forEach(platform => {
            setPlatformStatuses(prev => ({
              ...prev,
              [platform]: { status: 'error', data: null }
            }));
          });
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
  const allRatings: MovieRatingData = {
    type: 'movie',
    douban: platformStatuses.douban?.data,
    imdb: platformStatuses.imdb?.data,
    letterboxd: platformStatuses.letterboxd?.data,
    rottentomatoes: platformStatuses.rottentomatoes?.data,
    metacritic: platformStatuses.metacritic?.data,
    tmdb: tmdbRating,
    trakt: traktRating
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
        const data = await fetchTMDBRating('movie', id!);
        setTmdbRating(data);
        setTmdbStatus('successful');
      } catch (error) {
        setTmdbStatus('error');
      }
    } else if (platform === 'trakt') {
      setTraktStatus('loading');
      try {
        const data = await fetchTraktRating('movies', id!);
        if (!data || !data.rating) {
          setTraktStatus('no_rating');
          setTraktRating(null);
          return;
        }
        setTraktRating({
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
        });
        setTraktStatus('successful');
      } catch (error) {
        setTraktStatus('error');
      }
    } else {
      setPlatformStatuses(prev => ({
        ...prev,
        [platform]: { ...prev[platform], status: 'loading' }
      }));
      
      try {
        const response = await fetch(`/api/ratings/${platform}/movie/${id}`);
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
          [platform]: { status: frontendStatus, data }
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
    if (!movie || isExporting) return;
    
    setIsExporting(true);
    
    try {
      // 预加载图片
      await preloadImages([
        movie.poster,
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
      
      // 构建文件名：标题+年份
      const fileName = `${movie.title} (${movie.year})`.replace(/[/\\?%*:|"<>]/g, '-');
      await exportToPng(element, `${fileName}.png`);
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
         <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !movie) {
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
      
      <div className="movie-content">
        <MovieHero 
          movie={{
            ...movie,
            runtime: movie.runtime || 0
          } as MediaMovie}
          backdropUrl={movie.backdrop}
          ratingData={allRatings}
        />
        <MovieMetadata
          runtime={movie.runtime}
          releaseDate={movie.releaseDate}
          genres={movie.genres}
        />
        
        <RatingSection 
          media={movie as MediaMovie}
          ratingData={allRatings}
          isLoading={false}
          error={undefined}
          tmdbStatus={tmdbStatus}
          traktStatus={traktStatus}
          backendPlatforms={backendPlatforms}
          onRetry={handleRetry}
        />

        <Credits
          cast={movie.credits.cast}
          crew={movie.credits.crew}
        />
      </div>

      {/* Export Content */}
      <div className="fixed left-0 top-0 -z-50 pointer-events-none">
        <div id="export-content" className="bg-white">
          {movie && (
            <ExportRatingCard 
              media={{
                title: movie.title,
                year: movie.year.toString(),
                poster: movie.poster
              }}
              ratingData={allRatings}
            />
          )}
        </div>
      </div>
      
      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="fixed bottom-8 right-8 export-button bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-colors"
      >
        <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
        {isExporting ? '导出中...' : '导出评分卡片'}
      </button>
    </div>
  );
}
