// ==========================================
// 电影评分网格
// ==========================================
import { RatingCard } from './RatingCard';
import { RottenTomatoesCard } from './RottenTomatoesCard';
import { MetacriticCard } from './MetacriticCard';
import { CDN_URL } from '../../api/api';
import type { 
  MovieRatingData,
  FetchStatus 
} from '../../types/ratings';
import { formatRating } from '../../utils/formatRating';
import { useEffect } from 'react';
import { calculateOverallRating } from './calculateOverallrating';
import { isValidRatingData } from '../../utils/ratingHelpers';

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

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {/* 豆瓣评分 */}
      {ratingData.douban && isValidRatingData(ratingData.douban.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/douban.png`}
          rating={Number(ratingData.douban.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.douban.rating_people))} 人评分`}
          showStars={true}
        />
      )}

      {/* IMDb 评分 */}
      {ratingData.imdb && isValidRatingData(ratingData.imdb.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/imdb.png`}
          rating={Number(ratingData.imdb.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.imdb.rating_people))} 人评分`}
          showStars={true}
        />
      )}

      {/* Rotten Tomatoes 评分 */}
      {ratingData.rottentomatoes?.series && (
        (ratingData.rottentomatoes.series.tomatometer !== '暂无' && 
         ratingData.rottentomatoes.series.tomatometer !== '0') || 
        (ratingData.rottentomatoes.series.audience_score !== '暂无' && 
         ratingData.rottentomatoes.series.audience_score !== '0')
      ) && (
        <RottenTomatoesCard
          criticScore={ratingData.rottentomatoes.series.tomatometer !== '暂无' && 
            ratingData.rottentomatoes.series.tomatometer !== '0' ? 
            formatRating.percentage(ratingData.rottentomatoes.series.tomatometer) : undefined}
          audienceScore={ratingData.rottentomatoes.series.audience_score !== '暂无' && 
            ratingData.rottentomatoes.series.audience_score !== '0' ? 
            formatRating.percentage(ratingData.rottentomatoes.series.audience_score) : undefined}
          criticReviews={ratingData.rottentomatoes.series.critics_count !== '暂无' ? 
            formatRating.count(ratingData.rottentomatoes.series.critics_count) : undefined}
          audienceReviews={ratingData.rottentomatoes.series.audience_count !== '暂无' ? 
            formatRating.count(ratingData.rottentomatoes.series.audience_count) : undefined}
          criticAvg={ratingData.rottentomatoes.series.critics_avg !== '暂无' ? 
            ratingData.rottentomatoes.series.critics_avg : undefined}
          audienceAvg={ratingData.rottentomatoes.series.audience_avg !== '暂无' ? 
            ratingData.rottentomatoes.series.audience_avg : undefined}
        />
      )}

      {/* Metacritic 评分 */}
      {ratingData.metacritic?.overall && (
        (ratingData.metacritic.overall.metascore !== '暂无' && 
         ratingData.metacritic.overall.metascore !== 'tbd' && 
         Number(ratingData.metacritic.overall.metascore) > 0) || 
        (ratingData.metacritic.overall.userscore !== '暂无' && 
         ratingData.metacritic.overall.userscore !== 'tbd' && 
         Number(ratingData.metacritic.overall.userscore) > 0)
      ) && (
        <MetacriticCard
          metascore={ratingData.metacritic.overall.metascore !== '暂无' && 
            ratingData.metacritic.overall.metascore !== 'tbd' && 
            Number(formatRating.number(ratingData.metacritic.overall.metascore)) > 0 ? 
            Number(formatRating.number(ratingData.metacritic.overall.metascore)) : undefined}
          userScore={ratingData.metacritic.overall.userscore !== '暂无' && 
            ratingData.metacritic.overall.userscore !== 'tbd' && 
            Number(formatRating.number(ratingData.metacritic.overall.userscore)) > 0 ? 
            Number(formatRating.number(ratingData.metacritic.overall.userscore)) : undefined}
          criticReviews={ratingData.metacritic.overall.critics_count !== '暂无' ? 
            formatRating.count(ratingData.metacritic.overall.critics_count) : undefined}
          userReviews={ratingData.metacritic.overall.users_count !== '暂无' ? 
            formatRating.count(ratingData.metacritic.overall.users_count) : undefined}
        />
      )}

      {/* Letterboxd 评分 */}
      {ratingData.letterboxd && isValidRatingData(ratingData.letterboxd.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/letterboxd.png`}
          rating={formatRating.letterboxd(ratingData.letterboxd.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.letterboxd.rating_count))} 人评分`}
          showStars={true}
        />
      )}

      {/* TMDB 评分 */}
      {ratingData.tmdb && isValidRatingData(ratingData.tmdb.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/tmdb.png`}
          rating={Number(ratingData.tmdb.rating)}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.tmdb.voteCount))} 人评分`}
          showStars={true}
        />
      )}

      {/* Trakt 评分 */}
      {ratingData.trakt && isValidRatingData(ratingData.trakt.rating) && (
        <RatingCard
          logo={`${CDN_URL}/logos/trakt.png`}
          rating={Number(ratingData.trakt.rating.toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(String(ratingData.trakt.votes))} 人评分`}
          showStars={true}
        />
      )}
    </div>
  );
} 