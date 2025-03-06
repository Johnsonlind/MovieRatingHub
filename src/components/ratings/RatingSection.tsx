// ==========================================
// 评分部分
// ==========================================
import { useState, useEffect } from 'react';
import { MovieRatingGrid } from './MovieRatingGrid';
import { TVShowRatingGrid } from './TVShowRatingGrid';
import { PlatformStatusBar } from './PlatformStatusBar';
import type { Movie, TVShow } from '../../types/media';
import type { MovieRatingData, RatingData, TVShowRatingData } from '../../types/ratings';
import type { FetchStatus, BackendPlatformStatus } from '../../types/status';
import { SeasonRatings } from '../tv/SeasonRatings';
import ErrorMessage from '../../utils/ErrorMessage';
import { calculateOverallRating } from './calculateOverallrating';
import { OverallRatingCard } from './OverallRatingCard';
import { cn } from '../../utils/utils';
import type { CalculatedRating } from '../../types/ratings';

interface RatingSectionProps {
  media: Movie | TVShow;
  ratingData?: RatingData;
  isLoading: boolean;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  tmdbStatus: FetchStatus;
  traktStatus: FetchStatus;
  backendPlatforms: BackendPlatformStatus[];
  onRetry: (platform: string) => void;
}

export function RatingSection({ 
  media, 
  ratingData, 
  isLoading, 
  error,
  tmdbStatus,
  traktStatus,
  backendPlatforms,
  onRetry
}: RatingSectionProps) {
  const isTVShow = media.type === 'tv';
  const hasSeasons = isTVShow && 'seasons' in media && (media as TVShow).seasons?.length > 0;
  
  const [realTimeRating, setRealTimeRating] = useState<CalculatedRating | null>(null);

  // 监听评分数据变化，实时计算综合评分
  useEffect(() => {
    if (ratingData) {
      const newRating = calculateOverallRating(ratingData, isTVShow ? 'tvshow' : 'movie');
      setRealTimeRating(newRating);
    }
  }, [ratingData]);

  const hasSeasonRatings = isTVShow && ratingData && (
    (ratingData.douban?.seasons?.length ?? 0) > 0 || 
    (ratingData.rottentomatoes?.seasons?.length ?? 0) > 0 || 
    (ratingData.metacritic?.seasons?.length ?? 0) > 0 ||
    (ratingData.tmdb?.seasons?.length ?? 0) > 0
  );

  const containerStyle = "bg-[var(--card-bg)] rounded-lg p-6";

  // 定义一个函数来获取当前处理的平台
  const getCurrentPlatform = () => {
    // 检查是否有错误状态
    if (error) {
      // 从 backendPlatforms 中找到状态为 error 的平台
      const errorPlatform = backendPlatforms.find(p => p.status === 'error');
      if (errorPlatform) {
        return errorPlatform.platform;
      }
    }
    return 'unknown';
  };

  return (
    <div className="container mx-auto px-4 py-8 content-container">
      {/* 综合评分 */}
      {realTimeRating?.rating && (
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-protection">综合评分</h2>
          <OverallRatingCard 
            rating={realTimeRating.rating} 
            validPlatformsCount={realTimeRating.platforms.length}
          />
        </section>
      )}

      {/* 评分状态 */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4 dark:text-white text-protection">数据来源</h2>
        <div className="rounded-lg p-4">
          <PlatformStatusBar
            backendStatuses={backendPlatforms}
            tmdbStatus={tmdbStatus}
            traktStatus={traktStatus}
            onRetry={onRetry}
          />
        </div>
      </section>

      {/* 评分标题和内容区域 */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4">
          {isTVShow ? '剧集评分' : '评分'}
        </h2>
        
        <div className={cn("p-6 rounded-lg bg-[#52709d]/50", containerStyle)}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-4"></div>
              <p className="text-gray-400">正在获取评分数据...</p>
            </div>
          ) : error ? (
            <ErrorMessage
              status={error.status}
              errorDetail={error.detail}
              onRetry={() => onRetry(getCurrentPlatform())}
            />
          ) : (
            isTVShow ? (
              <TVShowRatingGrid 
                ratingData={ratingData as TVShowRatingData} 
                onRetry={() => onRetry(getCurrentPlatform())}
              />
            ) : (
              <MovieRatingGrid 
                ratingData={ratingData as MovieRatingData} 
                onRetry={() => onRetry(getCurrentPlatform())}
              />
            )
          )}
        </div>
      </section>

      {/* 季度评分部分 */}
      {hasSeasons && hasSeasonRatings && (
        <section>
          <h2 className="text-2xl font-bold mb-4 ">季度评分</h2>
          <SeasonRatings
            seasons={(media as TVShow).seasons}
            ratingData={ratingData as TVShowRatingData}
            error={error}
            onRetry={onRetry}
          />
        </section>
      )}
    </div>
  );
}