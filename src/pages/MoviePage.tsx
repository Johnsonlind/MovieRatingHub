// ==========================================
// 电影详情页
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MovieHero } from '../components/movie/MovieHero';
import { Credits } from '../components/movie/Credits';
import { getMovie } from '../api/movies';
import { messages } from '../utils/messages';
import { exportToPng } from '../utils/export';
import { ExportRatingCard } from '../components/export/ExportRatingCard';
import { MovieMetadata } from '../components/movie/MovieMetadata';
import { RatingSection } from '../components/ratings/RatingSection';
import { preloadImages } from '../utils/export';
import { fetchTMDBRating, fetchTraktRating } from '../api/ratings';
import type { FetchStatus, BackendPlatformStatus } from '../types/status';
import { TMDBRating, TraktRating, MovieRatingData } from '../types/ratings';
import { Movie as MediaMovie } from '../types/media';
import { ThemeToggle } from '../utils/ThemeToggle';
import { CDN_URL } from '../api/api';
import { getBase64Image } from '../utils/image';
import { SearchButton } from '../utils/SearchButton';
import { HomeButton } from '../utils/HomeButton';
import { ExportButton } from '../utils/ExportButton';
import { FavoriteButton } from '../utils/FavoriteButton';
import { UserButton } from '../utils/UserButton';

interface PlatformStatus {
  status: FetchStatus;
  data: any;
}

interface PlatformStatuses {
  [key: string]: PlatformStatus;
}

const PRELOAD_IMAGES = [
  `${CDN_URL}/background.png`,
  `${CDN_URL}/rating-template.png`,
  `${CDN_URL}/logos/douban.png`, 
  `${CDN_URL}/logos/imdb.png`,
  `${CDN_URL}/logos/letterboxd.png`,
  `${CDN_URL}/logos/rottentomatoes.png`,
  `${CDN_URL}/logos/metacritic.png`,
  `${CDN_URL}/logos/metacritic_audience.png`,
  `${CDN_URL}/logos/tmdb.png`,
  `${CDN_URL}/logos/trakt.png`
];

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

  const [posterBase64, setPosterBase64] = useState<string | null>(null);

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
            const response = await fetch(`/api/ratings/${platform}/movie/${id}`);
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

        // TMDB 和 Trakt 的获取逻辑保持不变
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
              }
            });
            setTraktStatus('successful');
          })
          .catch(() => {
            setTraktStatus('error');
            setTraktRating(null);
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
    if (movie) {
      preloadImages({
        poster: movie.poster,
        cdnImages: [
          `${CDN_URL}/background.png`,
          `${CDN_URL}/rating-template.png`,
          `${CDN_URL}/logos/douban.png`,
          `${CDN_URL}/logos/imdb.png`,
          `${CDN_URL}/logos/letterboxd.png`,
          `${CDN_URL}/logos/rottentomatoes.png`,
          `${CDN_URL}/logos/metacritic.png`,
          `${CDN_URL}/logos/metacritic_audience.png`,
          `${CDN_URL}/logos/tmdb.png`,
          `${CDN_URL}/logos/trakt.png`
        ]
      }).catch(error => {
        console.warn('图片预加载失败:', error);
      });
    }
  }, [movie]);

  useEffect(() => {
    if (movie?.poster) {
      getBase64Image(movie.poster)
        .then(base64 => setPosterBase64(base64))
        .catch(error => console.error('Failed to convert poster to base64:', error));
    }
  }, [movie]);

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
      logo: `${CDN_URL}/logos/douban.png`,
      status: platformStatuses.douban.status
    },
    {
      platform: 'imdb',
      logo: `${CDN_URL}/logos/imdb.png`,
      status: platformStatuses.imdb.status
    },
    {
      platform: 'letterboxd',
      logo: `${CDN_URL}/logos/letterboxd.png`,
      status: platformStatuses.letterboxd.status
    },
    {
      platform: 'rottentomatoes',
      logo: `${CDN_URL}/logos/rottentomatoes.png`,
      status: platformStatuses.rottentomatoes.status
    },
    {
      platform: 'metacritic',
      logo: `${CDN_URL}/logos/metacritic.png`,
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
    
    // 验证是否有有效的评分数据
    const hasValidRatings = Object.values(allRatings).some(rating => 
      rating && typeof rating === 'object' && Object.keys(rating).length > 0
    );
    
    if (!hasValidRatings) {
      console.error('没有有效的评分数据可供导出');
      return;
    }
    
    setIsExporting(true);
    
    try {
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
      <ThemeToggle />
      <HomeButton />
      <SearchButton />
      <UserButton />
      <FavoriteButton 
        mediaId={id || ''}
        mediaType="movie"
        title={movie.title}
        poster={movie.poster}
        year={String(movie.year || '')}
      />
      <ExportButton onExport={handleExport} isExporting={isExporting} />

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

      <div className="fixed left-0 top-0 -z-50 pointer-events-none opacity-0">
        <div id="export-content" className="bg-white">
          {movie && (
            <ExportRatingCard 
              media={{
                title: movie.title,
                year: movie.year.toString(),
                poster: posterBase64 || movie.poster
              }}
              ratingData={allRatings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
