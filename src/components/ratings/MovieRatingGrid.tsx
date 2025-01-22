import { RatingCard } from './RatingCard';
import { RottenTomatoesCard } from './RottenTomatoesCard';
import { MetacriticCard } from './MetacriticCard';
import { CDN_URL } from '../../lib/config';
import type { 
  MovieRatingData,
  FetchStatus 
} from '../../types/ratings';
import { formatRating } from '../../utils/ratings';
import { useEffect } from 'react';
import { calculateOverallRating } from './calculateOverallrating';

interface MovieRatingGridProps {
  ratingData?: MovieRatingData;
  className?: string;
  isLoading?: boolean;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  onRetry: () => void;
}

export function MovieRatingGrid({ 
  ratingData,
  className = '',
  isLoading,
  error,
  onRetry
}: MovieRatingGridProps) {
  useEffect(() => {
    if (ratingData) {
      calculateOverallRating(ratingData);
    }
  }, [ratingData]);

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
        <p className="text-red-500">
          加载评分数据失败: {error.detail}
          <button 
            onClick={onRetry}
            className="ml-2 text-blue-500 hover:text-blue-600"
          >
            重试
          </button>
        </p>
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

  const isValidScore = (score: string | number | undefined | null): boolean => {
    if (score === undefined || score === null || score === '暂无' || score === 0) return false;
    return !isNaN(Number(score)) && Number(score) > 0;
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {/* Douban */}
      {ratingData.douban && isValidScore(ratingData.douban.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/douban.png`}
          rating={Number(ratingData.douban.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.douban.rating_people))} 人评分`}
          showStars={true}
        />
      )}

      {/* IMDb */}
      {ratingData.imdb && isValidScore(ratingData.imdb.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/imdb.png`}
          rating={Number(ratingData.imdb.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.imdb.rating_people))} 人评分`}
          showStars={true}
        />
      )}

      {/* Rotten Tomatoes */}
      {ratingData.rottentomatoes?.series && (
        <RottenTomatoesCard
          criticScore={formatRating.percentage(ratingData.rottentomatoes.series.tomatometer)}
          audienceScore={formatRating.percentage(ratingData.rottentomatoes.series.audience_score)}
          criticReviews={formatRating.count(ratingData.rottentomatoes.series.critics_count)}
          audienceReviews={formatRating.count(ratingData.rottentomatoes.series.audience_count)}
          criticAvg={ratingData.rottentomatoes.series.critics_avg}
          audienceAvg={ratingData.rottentomatoes.series.audience_avg}
        />
      )}

      {/* Metacritic */}
      {ratingData.metacritic?.overall && (
        <MetacriticCard
          metascore={Number(formatRating.number(ratingData.metacritic.overall.metascore))}
          userScore={Number(formatRating.number(ratingData.metacritic.overall.userscore))}
          criticReviews={String(formatRating.count(ratingData.metacritic.overall.critics_count))}
          userReviews={String(formatRating.count(ratingData.metacritic.overall.users_count))}
        />
      )}

      {/* Letterboxd */}
      {ratingData.letterboxd && isValidScore(ratingData.letterboxd.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/letterboxd.png`}
          rating={Number(ratingData.letterboxd.rating)}
          maxRating={5}
          label={`${formatRating.count(String(ratingData.letterboxd.rating_count))} 人评分`}
          showStars={true}
        />
      )}

      {/* TMDB */}
      {ratingData.tmdb && isValidScore(ratingData.tmdb.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/tmdb.png`}
          rating={Number(ratingData.tmdb.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.tmdb.voteCount))} 人评分`}
          showStars={true}
        />
      )}

      {/* Trakt */}
      {ratingData.trakt && isValidScore(ratingData.trakt.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/trakt.png`}
          rating={Number(ratingData.trakt.rating.toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.trakt.voteCount))} 人评分`}
          showStars={true}
        />
      )}
    </div>
  );
} 
