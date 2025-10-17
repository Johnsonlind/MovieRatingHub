// ==========================================
// 剧集评分网格组件 - 显示剧集的各平台评分卡片（支持整剧和分季）
// ==========================================
import { RatingCard } from './RatingCard';
import { RottenTomatoesCard } from './RottenTomatoesCard';
import { MetacriticCard } from './MetacriticCard';
import type { TVShowRatingData } from '../../types/ratings';
import { formatRating } from '../../utils/formatRating';
import ErrorMessage from '../../utils/ErrorMessage';
import type { FetchStatus } from '../../types/status';
import { calculateSeasonRating } from './calculateSeasonRating';
import { OverallRatingCard } from './OverallRatingCard';
import { calculateTVShowOverallRating } from './calculateTVShowOverallRating';
import { isValidRatingData } from '../../utils/ratingHelpers';

interface TVShowRatingGridProps {
  ratingData: TVShowRatingData;
  selectedSeason?: number;
  className?: string;
  isLoading?: boolean;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  onRetry: () => void;
}

export function TVShowRatingGrid({ 
  ratingData, 
  selectedSeason, 
  className = '',
  isLoading,
  error,
  onRetry
}: TVShowRatingGridProps) {
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center p-8 ${className}`}>
        <ErrorMessage
          status={error.status}
          errorDetail={error.detail}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (!ratingData) {
    return (
      <div className={`text-center p-8 ${className}`}>
        <p className="text-gray-500">暂无评分数据</p>
      </div>
    );
  }

  const getSeasonRatings = () => {
    if (selectedSeason) {
      const tmdbSeasonRating = ratingData?.tmdb?.seasons?.find(s => 
        s.season_number === selectedSeason
      );
      
      const traktSeasonRating = ratingData?.trakt?.seasons?.find(s => 
        s.season_number === selectedSeason
      );

      return {
        type: 'tv' as const,
        douban: ratingData?.douban?.seasons?.find(s => s.season_number === selectedSeason),
        imdb: null,
        rt: ratingData?.rottentomatoes?.seasons?.find(s => s.season_number === selectedSeason),
        metacritic: ratingData?.metacritic?.seasons?.find(s => s.season_number === selectedSeason),
        tmdb: tmdbSeasonRating ? {
          rating: tmdbSeasonRating.rating,
          voteCount: tmdbSeasonRating.voteCount
        } : null,
        trakt: traktSeasonRating ? {
          rating: traktSeasonRating.rating,
          votes: traktSeasonRating.votes || 0,
          distribution: traktSeasonRating.distribution,
          seasons: ratingData?.trakt?.seasons
        } : null
      };
    }

    return {
      type: 'tv' as const,
      douban: ratingData?.douban,
      imdb: ratingData?.imdb,
      rt: ratingData?.rottentomatoes?.series,
      metacritic: ratingData?.metacritic?.overall,
      tmdb: ratingData?.tmdb,
      trakt: ratingData?.trakt,
      seasons: [
        ...(ratingData?.douban?.seasons || []),
        ...(ratingData?.rottentomatoes?.seasons || []),
        ...(ratingData?.metacritic?.seasons || []),
        ...(ratingData?.tmdb?.seasons || []),
        ...(ratingData?.trakt?.seasons || [])
      ]
    };
  };

  const ratings = getSeasonRatings();

  // TMDB 评分卡片的渲染逻辑
  const renderTMDBRating = () => {
    if (!ratings.tmdb?.rating) return null;
    return (
      <RatingCard
        logo={`/logos/tmdb.png`}
        rating={Number(formatRating.tmdb(ratings.tmdb.rating))}
        maxRating={10}
        label={selectedSeason ? undefined : ratings.tmdb.voteCount ? `${formatRating.count(ratings.tmdb.voteCount)} 人评分` : undefined}
        showStars={true}
      />
    );
  };

  // Trakt 评分卡片的渲染逻辑
  const renderTraktRating = () => {
    if (selectedSeason) {
      const seasonRating = ratings.trakt?.seasons?.find(s => 
        s.season_number === selectedSeason
      );

      if (seasonRating?.rating && seasonRating.rating > 0) {
        return (
          <RatingCard
            logo={`/logos/trakt.png`}
            rating={Number((seasonRating.rating).toFixed(1))}
            maxRating={10}
            label={seasonRating.votes ? `${formatRating.count(seasonRating.votes)} 人评分` : undefined}
            showStars
          />
        );
      }
    } else if (ratings.trakt?.rating && ratings.trakt.rating > 0) {
      return (
        <RatingCard
          logo={`/logos/trakt.png`}
          rating={Number((ratings.trakt.rating).toFixed(1))}
          maxRating={10}
          label={ratings.trakt.votes ? `${formatRating.count(ratings.trakt.votes)} 人评分` : undefined}
          showStars
        />
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {!selectedSeason && (
        <div className="mb-6">
          <OverallRatingCard 
            rating={calculateTVShowOverallRating(ratingData).rating || 0} 
            validPlatformsCount={calculateTVShowOverallRating(ratingData).validRatings}
          />
        </div>
      )}
      {selectedSeason && ratings && (
        <div className="mb-6">
          <OverallRatingCard 
            rating={calculateSeasonRating(ratingData, selectedSeason).rating || 0}
            validPlatformsCount={calculateSeasonRating(ratingData, selectedSeason).validRatings}
          />
        </div>
      )}
      {/* 评分卡片 */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {/* 豆瓣评分 */}
        {ratings.douban && ratings.douban.rating && ratings.douban.rating !== '暂无' && Number(ratings.douban.rating) > 0 && (
          <RatingCard
            logo={`/logos/douban.png`}
            rating={Number(ratings.douban.rating)}
            maxRating={10}
            label={`${formatRating.count(ratings.douban.rating_people)} 人评分`}
            showStars
          />
        )}
        {/* IMDb 评分 */}
        {ratings.imdb && ratings.imdb.rating && ratings.imdb.rating !== '暂无' && Number(ratings.imdb.rating) > 0 && (
          <RatingCard
            logo={`/logos/imdb.png`}
            rating={Number(ratings.imdb.rating)}
            maxRating={10}
            label={`${formatRating.count(ratings.imdb.rating_people)} 人评分`}
            showStars
          />
        )}
        {/* Rotten Tomatoes 评分 */}
        {ratings.rt && (isValidRatingData(ratings.rt.tomatometer) || isValidRatingData(ratings.rt.audience_score)) && (
          <RottenTomatoesCard
            criticScore={ratings.rt.tomatometer !== '暂无' && 
              ratings.rt.tomatometer !== '0' && 
              ratings.rt.tomatometer !== 'tbd' ? 
              formatRating.percentage(ratings.rt.tomatometer) : undefined}
            audienceScore={ratings.rt.audience_score !== '暂无' && 
              ratings.rt.audience_score !== '0' && 
              ratings.rt.audience_score !== 'tbd' ? 
              formatRating.percentage(ratings.rt.audience_score) : undefined}
            criticReviews={ratings.rt.critics_count !== '暂无' ? 
              formatRating.count(ratings.rt.critics_count) : undefined}
            audienceReviews={ratings.rt.audience_count !== '暂无' ? 
              formatRating.count(ratings.rt.audience_count) : undefined}
            criticAvg={ratings.rt.critics_avg !== '暂无' ? ratings.rt.critics_avg : undefined}
            audienceAvg={ratings.rt.audience_avg !== '暂无' ? ratings.rt.audience_avg : undefined}
          />
        )}
        {/* Metacritic 评分 */}
        {ratings.metacritic && (
          (ratings.metacritic.metascore !== '暂无' && 
           ratings.metacritic.metascore !== 'tbd' && 
           Number(ratings.metacritic.metascore) > 0) || 
          (ratings.metacritic.userscore !== '暂无' && 
           ratings.metacritic.userscore !== 'tbd' && 
           Number(ratings.metacritic.userscore) > 0)
        ) && (
          <MetacriticCard
            metascore={ratings.metacritic.metascore !== '暂无' && 
              ratings.metacritic.metascore !== 'tbd' ? 
              Number(formatRating.number(ratings.metacritic.metascore)) : 0}
            userScore={ratings.metacritic.userscore !== '暂无' && 
              ratings.metacritic.userscore !== 'tbd' ? 
              Number(formatRating.number(ratings.metacritic.userscore)) : 0}
            criticReviews={ratings.metacritic.critics_count !== '暂无' ? 
              formatRating.count(ratings.metacritic.critics_count) : undefined}
            userReviews={ratings.metacritic.users_count !== '暂无' ? 
              formatRating.count(ratings.metacritic.users_count) : undefined}
          />
        )}
        {/* Letterboxd 评分 */}
        {!selectedSeason && 
         ratingData.letterboxd?.rating && 
         ratingData.letterboxd.rating !== '暂无' && 
         Number(ratingData.letterboxd.rating) > 0 && (
            <RatingCard
              logo={`/logos/letterboxd.png`}
              rating={formatRating.letterboxd(Number(ratingData.letterboxd.rating))}
              maxRating={10}
              label={`${formatRating.count(ratingData.letterboxd.rating_count)} 人评分`}
              showStars
            />
          )}
        {/* TMDB 评分 */}
        {renderTMDBRating()}
        {/* Trakt 评分 */}
        {renderTraktRating()}
      </div>
    </div>
  );
} 