import { RatingCard } from './RatingCard';
import { RottenTomatoesCard } from './RottenTomatoesCard';
import { MetacriticCard } from './MetacriticCard';
import type { TVShowRatingData } from '../../types/ratings';
import { formatRating } from '../../utils/formatRating';
import ErrorMessage from '../common/ErrorMessage';
import type { FetchStatus } from '../../types/status';

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
  console.log('TVShowRatingGrid props:', {
    selectedSeason,
    hasTrakt: Boolean(ratingData.trakt),
    traktRating: ratingData.trakt?.rating
  });

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
        trakt: null
      };
    }

    return {
      type: 'tv' as const,
      douban: ratingData?.douban,
      imdb: ratingData?.imdb,
      rt: ratingData?.rottentomatoes?.series,
      metacritic: ratingData?.metacritic?.overall,
      tmdb: ratingData?.tmdb,
      trakt: ratingData?.trakt
    };
  };

  const ratings = getSeasonRatings();
  console.log('TMDB Season Rating:', ratingData.tmdb?.seasons?.find(s => 
    s.season_number === selectedSeason
  ));

  console.log('当前评分数据:', {
    douban: ratings.douban,
    imdb: ratings.imdb,
    rt: ratings.rt,
    metacritic: ratings.metacritic,
    tmdb: ratings.tmdb,
    trakt: ratings.trakt,
    selectedSeason,
    isSpecialSeason: selectedSeason === 0
  });

  // TMDB 评分卡片的渲染逻辑
  const renderTMDBRating = () => {
    if (!ratings.tmdb?.rating) return null;
    return (
      <RatingCard
        logo="/logos/tmdb.png"
        rating={Number(formatRating.tmdb(ratings.tmdb.rating))}
        maxRating={10}
        label={selectedSeason ? undefined : ratings.tmdb.voteCount ? `${formatRating.count(ratings.tmdb.voteCount)} 人评分` : undefined}
        showStars={true}
      />
    );
  };

  // Trakt 评分卡片的渲染逻辑
  const renderTraktRating = () => {
    if (!selectedSeason && ratings.trakt?.rating && ratings.trakt.rating > 0) {
      return (
        <RatingCard
          logo="/logos/trakt.png"
          rating={Number((ratings.trakt.rating).toFixed(1))}
          maxRating={10}
          label={ratings.trakt.voteCount ? `${formatRating.count(ratings.trakt.voteCount)} 人评分` : undefined}
          showStars
        />
      );
    }
    return null;
  };

  return (
    <div className={className}>
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {ratings.douban && ratings.douban.rating && ratings.douban.rating !== '暂无' && Number(ratings.douban.rating) > 0 && (
          <RatingCard
            logo="/logos/douban.png"
            rating={Number(ratings.douban.rating)}
            maxRating={10}
            label={`${formatRating.count(ratings.douban.rating_people)} 人评分`}
            showStars
          />
        )}
        {ratings.imdb && ratings.imdb.rating && ratings.imdb.rating !== '暂无' && Number(ratings.imdb.rating) > 0 && (
          <RatingCard
            logo="/logos/imdb.png"
            rating={Number(ratings.imdb.rating)}
            maxRating={10}
            label={`${formatRating.count(ratings.imdb.rating_people)} 人评分`}
            showStars
          />
        )}

        {ratings.rt && (
          (ratings.rt.tomatometer !== '暂无' && ratings.rt.tomatometer !== '0') || 
          (ratings.rt.audience_score !== '暂无' && ratings.rt.audience_score !== '0')
        ) && (
          <RottenTomatoesCard
            criticScore={formatRating.percentage(ratings.rt.tomatometer)}
            audienceScore={formatRating.percentage(ratings.rt.audience_score)}
            criticReviews={formatRating.count(ratings.rt.critics_count)}
            audienceReviews={formatRating.count(ratings.rt.audience_count)}
            criticAvg={ratings.rt.critics_avg !== '暂无' ? ratings.rt.critics_avg : undefined}
            audienceAvg={ratings.rt.audience_avg !== '暂无' ? ratings.rt.audience_avg : undefined}
          />
        )}

        {ratings.metacritic && 
         ratings.metacritic.metascore && 
         ratings.metacritic.metascore !== '暂无' && 
         ratings.metacritic.metascore !== 'tbd' &&
         Number(ratings.metacritic.metascore) > 0 && (
            <MetacriticCard
              metascore={formatRating.number(ratings.metacritic.metascore)}
              userScore={formatRating.number(ratings.metacritic.userscore)}
              criticReviews={formatRating.count(ratings.metacritic.critics_count)}
              userReviews={formatRating.count(ratings.metacritic.users_count)}
            />
          )}
        {!selectedSeason && 
         ratingData.letterboxd?.rating && 
         ratingData.letterboxd.rating !== '暂无' && 
         Number(ratingData.letterboxd.rating) > 0 && (
            <RatingCard
              logo="/logos/letterboxd.png"
              rating={Number(ratingData.letterboxd.rating)}
              maxRating={5}
              label={`${formatRating.count(ratingData.letterboxd.rating_count)} 人评分`}
              showStars
            />
          )}

        {renderTMDBRating()}
        {renderTraktRating()}
      </div>
    </div>
  );
} 