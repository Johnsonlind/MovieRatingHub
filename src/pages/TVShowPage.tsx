// ==========================================
// 剧集详情页
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TVShowHero } from '../components/tv/TVShowHero';
import { Credits } from '../components/common/Credits';
import { getTVShow } from '../api/tv';
import { messages } from '../types/messages';
import { exportToPng } from '../utils/export';
import { ExportTVShowRatingCard } from '../components/export/ExportTVShowRatingCard';
import { TVShowMetadata } from '../components/tv/TVShowMetadata';
import { RatingSection } from '../components/ratings/RatingSection';
import { preloadImages } from '../utils/export';
import type { FetchStatus, BackendPlatformStatus } from '../types/status';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { NavBar } from '../components/ui/NavBar';
import { getBase64Image } from '../api/image';
import { TVShowRatingData } from '../types/ratings';
import { ExportButton, type ExportLayout } from '../components/ui/ExportButton';
import { FavoriteButton } from '../components/ui/FavoriteButton';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { ScrollToTopButton } from '../components/ui/ScrollToTopButton';
import { Footer } from '../components/common/Footer';
import { useMediaRatings } from '../hooks/useMediaRatings';
import { MediaPageSkeleton } from '../components/common/MediaPageSkeleton';

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

export default function TVShowPage() {
  const { id } = useParams();
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);
  const exportSeasonRef = useRef<number | undefined>(undefined);
  
  const {
    platformStatuses,
    tmdbStatus,
    traktStatus,
    tmdbRating,
    traktRating,
    retryCount,
    handleRetry
  } = useMediaRatings({ mediaId: id, mediaType: 'tv' });
  
  const [posterBase64, setPosterBase64] = useState<string | null>(null);

  const { data: tvShow, isLoading, error: queryError } = useQuery({
    queryKey: ['tvshow', id],
    queryFn: () => getTVShow(id!),
    enabled: !!id,
    staleTime: Infinity
  });

  useEffect(() => {
    if (tvShow) {
      const title = tvShow.title || '剧集详情';
      const year = tvShow.firstAirDate ? ` (${tvShow.firstAirDate.slice(0, 4)})` : '';
      document.title = `${title}${year} - RateFuse`;
    } else {
      document.title = '剧集详情 - RateFuse';
    }
  }, [tvShow]);


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

  const allRatings: TVShowRatingData = {
    type: 'tv',
    douban: platformStatuses.douban.data,
    imdb: platformStatuses.imdb.data,
    letterboxd: platformStatuses.letterboxd.data,
    rottentomatoes: platformStatuses.rottentomatoes.data,
    metacritic: platformStatuses.metacritic.data,
    tmdb: tmdbRating ?? undefined,
    trakt: traktRating ?? undefined
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


  const handleSeasonChange = async (season: number | undefined) => {
    exportSeasonRef.current = season;
    setSelectedSeason(season);
  };

  const handleExport = async (layout: ExportLayout) => {
    const seasonToExport = exportSeasonRef.current;

    if (!tvShow || isExporting) return;
    setIsExporting(true);

    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => resolve(null), 0);
        });
      });
    });

    try {
      const element = document.getElementById(`export-content-${layout}`);
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
        {tvShow && (
          <>
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
          </>
        )}

        <div className="tv-show-content">
          {isLoading || !tvShow ? (
            <MediaPageSkeleton />
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="fixed left-0 top-0 -z-50 pointer-events-none opacity-0">
          <div id="export-content-portrait" style={{ width: '887px', overflow: 'hidden' }}>
            {tvShow && (
              <ExportTVShowRatingCard
                tvShow={{
                  ...tvShow,
                  poster: posterBase64 || tvShow.poster
                }}
                ratingData={allRatings}
                selectedSeason={selectedSeason}
                layout="portrait"
              />
            )}
          </div>
          <div id="export-content-landscape" style={{ width: '1200px', overflow: 'hidden' }}>
            {tvShow && (
              <ExportTVShowRatingCard
                tvShow={{
                  ...tvShow,
                  poster: posterBase64 || tvShow.poster
                }}
                ratingData={allRatings}
                selectedSeason={selectedSeason}
                layout="landscape"
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
