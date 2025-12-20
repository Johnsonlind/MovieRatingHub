// ==========================================
// 电影详情页
// ==========================================
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MovieHero } from '../components/movie/MovieHero';
import { Credits } from '../components/common/Credits';
import { getMovie } from '../api/movies';
import { messages } from '../types/messages';
import { exportToPng, preloadImages } from '../utils/export';
import { ExportRatingCard } from '../components/export/ExportRatingCard';
import { MovieMetadata } from '../components/movie/MovieMetadata';
import { RatingSection } from '../components/ratings/RatingSection';
import type { FetchStatus, BackendPlatformStatus } from '../types/status';
import { MovieRatingData } from '../types/ratings';
import { Movie as MediaMovie } from '../types/media';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { NavBar } from '../components/ui/NavBar';
import { getBase64Image } from '../api/image';
import { ExportButton } from '../components/ui/ExportButton';
import { FavoriteButton } from '../components/ui/FavoriteButton';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { ScrollToTopButton } from '../components/ui/ScrollToTopButton';
import { Footer } from '../components/common/Footer';
import { useMediaRatings } from '../hooks/useMediaRatings';
import { MediaPageSkeleton } from '../components/common/MediaPageSkeleton';

const PRELOAD_IMAGES = [
  '/background.png',
  '/rating-template.png',
  '/logos/douban.png',
  '/logos/imdb.png',
  '/logos/letterboxd.png',
  '/logos/rottentomatoes.png',
  '/logos/metacritic.png',
  '/logos/metacritic_audience.png',
  '/logos/tmdb.png',
  '/logos/trakt.png'
];

const formatQueryError = (error: unknown): { status: FetchStatus; detail: string } => {
  return {
    status: 'error',
    detail: error instanceof Error ? error.message : String(error)
  };
};

export default function MoviePage() {
  const { id } = useParams();
  const [isExporting, setIsExporting] = useState(false);
  
  const {
    platformStatuses,
    tmdbStatus,
    traktStatus,
    tmdbRating,
    traktRating,
    retryCount,
    handleRetry
  } = useMediaRatings({ mediaId: id, mediaType: 'movie' });

  const { data: movie, isLoading, error: queryError } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => getMovie(id!),
    enabled: !!id,
    staleTime: Infinity
  });

  // 设置页面标题
  useEffect(() => {
    if (movie) {
      const title = movie.title || '电影详情';
      const year = movie.releaseDate ? ` (${movie.releaseDate.slice(0, 4)})` : '';
      document.title = `${title}${year} - RateFuse`;
    } else {
      document.title = '电影详情 - RateFuse';
    }
  }, [movie]);

  const [posterBase64, setPosterBase64] = useState<string | null>(null);

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
        cdnImages: PRELOAD_IMAGES
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

  const allRatings: MovieRatingData = {
    type: 'movie',
    douban: platformStatuses.douban?.data,
    imdb: platformStatuses.imdb?.data,
    letterboxd: platformStatuses.letterboxd?.data,
    rottentomatoes: platformStatuses.rottentomatoes?.data,
    metacritic: platformStatuses.metacritic?.data,
    tmdb: tmdbRating ?? null,
    trakt: traktRating ?? null
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
      logo: '/logos/rottentomatoes.png',
      status: platformStatuses.rottentomatoes.status
    },
    {
      platform: 'metacritic',
      logo: '/logos/metacritic.png',
      status: platformStatuses.metacritic.status
    }
  ];


  const handleExport = async () => {
    if (!movie || isExporting) return;

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

      const fileName = `${movie.title} (${movie.year})`.replace(/[/\\?%*:|"<>]/g, '-');
      await exportToPng(element, `${fileName}.png`);
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (queryError) {
    return (
      <>
        <NavBar />
        <div className="min-h-screen flex items-center justify-center pt-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Error</h2>
            <p className="text-gray-600 dark:text-gray-400">{messages.errors.loadMovieFailed}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className="min-h-screen pt-16 safe-area-bottom">
        <ThemeToggle />
        <ScrollToTopButton />
        {movie && (
          <>
            <FavoriteButton
              mediaId={id || ''}
              mediaType="movie"
              title={movie.title}
              poster={movie.poster}
              year={String(movie.year || '')}
              overview={movie.overview}
            />
            <ExportButton onExport={handleExport} isExporting={isExporting} />
          </>
        )}

        <div className="movie-content">
          {isLoading || !movie ? (
            <MediaPageSkeleton />
          ) : (
            <>
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
            </>
          )}
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
