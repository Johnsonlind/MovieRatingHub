import { RatingCard } from '../ratings/RatingCard';
import { RottenTomatoesCard } from '../ratings/RottenTomatoesCard';
import { MetacriticCard } from '../ratings/MetacriticCard';
import { OverallRatingCard } from '../ratings/OverallRatingCard';
import { formatRating } from '../../utils/formatRating';
import type { RatingData } from '../../types/ratings';
import { calculateOverallRating } from '../ratings/calculateOverallrating';

interface ExportRatingCardProps {
  media: {
    title: string;
    year: string;
    poster: string;
  };
  ratingData: RatingData;
  selectedSeason?: number;
}

export function ExportRatingCard({ media, ratingData }: ExportRatingCardProps) {
  if (!media || !ratingData) {
    console.log('Missing required data:', { media, ratingData });
    return null;
  }

  const ratingCards = [];
  
  // 使用完整的评分计算函数
  const { rating: overallRating, validRatings: validPlatformsCount, platforms } = calculateOverallRating(ratingData);

  // 添加调试日志
  console.log('ExportRatingCard ratingData:', {
    rottentomatoes: ratingData.rottentomatoes,
    tmdb: ratingData.tmdb,
    all: ratingData
  });

  // Douban
  if (ratingData.douban?.rating && ratingData.douban.rating !== '暂无' && Number(ratingData.douban.rating) > 0) {
    ratingCards.push(
      <div key="douban" className="w-full">
        <RatingCard
          logo="/logos/douban.png"
          rating={Number(ratingData.douban.rating)}
          maxRating={10}
          label={`${formatRating.count(ratingData.douban.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // IMDb
  if (ratingData.imdb?.rating && ratingData.imdb.rating !== '暂无' && Number(ratingData.imdb.rating) > 0) {
    ratingCards.push(
      <div key="imdb" className="w-full">
        <RatingCard
          logo="/logos/imdb.png"
          rating={Number(ratingData.imdb.rating)}
          maxRating={10}
          label={`${formatRating.count(ratingData.imdb.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // Rotten Tomatoes
  if (ratingData.rottentomatoes && 'series' in ratingData.rottentomatoes && (
    (ratingData.rottentomatoes.series.tomatometer !== '暂无' && ratingData.rottentomatoes.series.tomatometer !== '0') ||
    (ratingData.rottentomatoes.series.audience_score !== '暂无' && ratingData.rottentomatoes.series.audience_score !== '0')
  )) {
    console.log('Adding Rotten Tomatoes card with:', {
      tomatometer: ratingData.rottentomatoes.series.tomatometer,
      audienceScore: ratingData.rottentomatoes.series.audience_score,
      criticReviews: ratingData.rottentomatoes.series.critics_count,
      audienceReviews: ratingData.rottentomatoes.series.audience_count,
      criticAvg: ratingData.rottentomatoes.series.critics_avg,
      audienceAvg: ratingData.rottentomatoes.series.audience_avg
    });

    ratingCards.push(
      <div key="rottentomatoes" className="w-full">
        <RottenTomatoesCard
          criticScore={formatRating.percentage(ratingData.rottentomatoes.series.tomatometer)}
          audienceScore={formatRating.percentage(ratingData.rottentomatoes.series.audience_score)}
          criticReviews={formatRating.count(ratingData.rottentomatoes.series.critics_count)}
          audienceReviews={formatRating.count(ratingData.rottentomatoes.series.audience_count)}
          criticAvg={ratingData.rottentomatoes.series.critics_avg !== '暂无' ? ratingData.rottentomatoes.series.critics_avg : undefined}
          audienceAvg={ratingData.rottentomatoes.series.audience_avg !== '暂无' ? ratingData.rottentomatoes.series.audience_avg : undefined}
        />
      </div>
    );
  }

  // Metacritic
  if (ratingData.metacritic?.overall) {
    ratingCards.push(
      <div key="metacritic" className="w-full">
        <MetacriticCard
          metascore={formatRating.number(ratingData.metacritic.overall.metascore)}
          userScore={formatRating.number(ratingData.metacritic.overall.userscore)}
          criticReviews={formatRating.count(ratingData.metacritic.overall.critics_count)}
          userReviews={formatRating.count(ratingData.metacritic.overall.users_count)}
        />
      </div>
    );
  }

  // Letterboxd
  if (ratingData.letterboxd?.rating) {
    ratingCards.push(
      <div key="letterboxd" className="w-full">
        <RatingCard
          logo="/logos/letterboxd.png"
          rating={Number(ratingData.letterboxd.rating)}
          maxRating={5}
          label={`${formatRating.count(ratingData.letterboxd.rating_count)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // TMDB
  if (ratingData.tmdb?.rating && Number(ratingData.tmdb.rating) > 0) {
    ratingCards.push(
      <div key="tmdb" className="w-full">
        <RatingCard
          logo="/logos/tmdb.png"
          rating={Number((ratingData.tmdb.rating).toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(ratingData.tmdb.voteCount)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // Trakt
  if (ratingData.trakt?.rating && ratingData.trakt.rating > 0) {
    ratingCards.push(
      <div key="trakt" className="w-full">
        <RatingCard
          logo="/logos/trakt.png"
          rating={Number((ratingData.trakt.rating).toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(ratingData.trakt.voteCount)} 人评分`}
          showStars
          distribution={ratingData.trakt.distribution}
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div 
      className="bg-[url('/background.png')] bg-cover bg-center p-8 w-[1200px] min-h-[800px] flex relative"
    >
      {/* Home Logo */}
      <div className="mt-auto ml-[-10px]">
        <img
          src="/logos/home.png"
          alt="Home"
          className="w-8 h-8 object-contain"
          crossOrigin="anonymous"
        />
      </div>

      {/* 左侧海报容器 */}
      <div className="w-[300px] flex items-center ml-[-30px]">
        <div className="w-[300px] h-[450px] flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100 relative">
          <img
            src={media.poster || '/fallback-poster.jpg'}
            alt={media.title}
            className="w-full h-full object-contain"
            crossOrigin="anonymous"
            loading="eager"
          />
        </div>
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 ml-20">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            {media.title} <span className="text-gray-500">({media.year})</span>
          </h1>
          {overallRating && (
            <div className="mt-4">
              <OverallRatingCard 
                rating={overallRating}
                validPlatformsCount={validPlatformsCount}
                platforms={platforms}
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-5">
          {ratingCards}
        </div>
      </div>
    </div>
  );
}