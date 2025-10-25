// ==========================================
// 分季评分组件 - 显示剧集每一季的评分卡片
// ==========================================
import type { TVShowRatingData } from '../../types/ratings';
import type { FetchStatus } from '../../types/status';
import { ErrorMessage } from '../../utils/ErrorMessage';
import { TVShowRatingGrid } from '../ratings/TVShowRatingGrid';
import { isValidRatingData } from '../../utils/ratingHelpers';

interface SeasonRatingsProps {
  seasons: {
    seasonNumber: number;
    name: string;
    episodeCount: number;
    airDate: string;
    poster?: string;
  }[];
  ratingData: TVShowRatingData;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  onRetry: (platform: string) => void;
}

export function SeasonRatings({ 
  seasons, 
  ratingData, 
  error,
  onRetry 
}: SeasonRatingsProps) {
  if (!seasons?.length) return null;

  if (error) {
    return (
      <ErrorMessage
        status={error.status}
        errorDetail={error.detail}
        onRetry={() => onRetry('platform')}
      />
    );
  }

  return (
    <div className="space-y-8">
      {seasons.map((season) => {
        if (!season.seasonNumber) return null;

        // 检查该季是否有任何平台的有效评分数据
        // 豆瓣：若该季无分季评分且为第1季，则把整剧评分视作该季有评分（用于显示该季卡片）
        const doubanSeason = ratingData.douban?.seasons?.find(s => 
          s.season_number === season.seasonNumber
        );
        const doubanRating = doubanSeason?.rating || (season.seasonNumber === 1 ? ratingData.douban?.rating : undefined);

        const rtRating = ratingData.rottentomatoes?.seasons?.find(s => 
          s.season_number === season.seasonNumber
        );

        const mcRating = ratingData.metacritic?.seasons?.find(s => 
          s.season_number === season.seasonNumber
        );

        const hasValidRatings = 
          isValidRatingData(doubanRating) ||
          (rtRating && (
            isValidRatingData(rtRating.tomatometer) ||
            isValidRatingData(rtRating.audience_score)
          )) ||
          (mcRating && (
            isValidRatingData(mcRating.metascore) ||
            isValidRatingData(mcRating.userscore)
          )) ||
          (ratingData.tmdb?.seasons?.some(s => 
            s.season_number === season.seasonNumber && 
            s.rating > 0
          )) ||
          (ratingData.trakt?.seasons?.some(s =>
            s.season_number === season.seasonNumber &&
            s.rating > 0
          ));

        if (!hasValidRatings) return null;

        return (
          <div key={season.seasonNumber} className="bg-[#52709d]/50 rounded-lg p-4">
            <div className="mb-3">
              <h4 className="text-lg font-medium">
                {season.seasonNumber === 0 ? '特别篇' : `第 ${season.seasonNumber} 季`}
              </h4>
              <p className="text-sm">
                {season.episodeCount} 集 • {new Date(season.airDate).getFullYear()}
              </p>
            </div>
            <TVShowRatingGrid 
              ratingData={ratingData}
              selectedSeason={season.seasonNumber}
              onRetry={() => onRetry('platform')}
            />
          </div>
        );
      })}
    </div>
  );
} 
