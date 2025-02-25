import { RatingCard } from '../ratings/RatingCard';
import { RottenTomatoesCard } from '../ratings/RottenTomatoesCard';
import { MetacriticCard } from '../ratings/MetacriticCard';
import { OverallRatingCard } from '../ratings/OverallRatingCard';
import { formatRating } from '../../utils/formatRating';
import type { RatingData } from '../../types/ratings';
import { calculateOverallRating } from '../ratings/calculateOverallrating';
import { CDN_URL } from '../../lib/config';

interface ExportRatingCardProps {
  media: {
    title: string;
    year: string;
    poster: string;
  };
  ratingData: RatingData;
  selectedSeason?: number;
}

// 检查评分是否有效的辅助函数
const isValidScore = (score: string | number | undefined | null): boolean => {
  if (score === undefined || score === null || score === '暂无' || score === 0) return false;
  return !isNaN(Number(score)) && Number(score) > 0;
};

// 检查 RT 评分是否有效
const isValidRTScore = (rt: any) => {
  if (!rt || !rt.series) return false;
  return (
    (rt.series.tomatometer !== '暂无' && rt.series.tomatometer !== '0') ||
    (rt.series.audience_score !== '暂无' && rt.series.audience_score !== '0') ||
    (rt.series.critics_avg !== '暂无') ||
    (rt.series.audience_avg !== '暂无')
  );
};

// 检查 Metacritic 评分是否有效
const isValidMCScore = (mc: any) => {
  if (!mc || !mc.overall) return false;
  return (
    (mc.overall.metascore !== '暂无' && mc.overall.metascore !== 'tbd' && Number(mc.overall.metascore) > 0) ||
    (mc.overall.userscore !== '暂无' && mc.overall.userscore !== 'tbd' && Number(mc.overall.userscore) > 0)
  );
};

export function ExportRatingCard({ media, ratingData, selectedSeason }: ExportRatingCardProps) {
  if (!media || !ratingData) {
    console.log('Missing required data:', { media, ratingData });
    return null;
  }

  const ratingCards = [];
  
  // 使用完整的评分计算函数
  const { rating: overallRating, validRatings: validPlatformsCount } = calculateOverallRating(ratingData);

  // 添加调试日志
  console.log('ExportRatingCard ratingData:', {
    rottentomatoes: ratingData.rottentomatoes,
    tmdb: ratingData.tmdb,
    all: ratingData
  });

  // 只有在评分有效时才添加对应的评分卡片
  if (ratingData.douban && isValidScore(ratingData.douban.rating)) {
    ratingCards.push(
      <div key="douban" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/douban.png`}
          rating={Number(ratingData.douban.rating)}
          maxRating={10}
          label={`${formatRating.count(ratingData.douban.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  if (ratingData.imdb && isValidScore(ratingData.imdb.rating)) {
    ratingCards.push(
      <div key="imdb" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/imdb.png`}
          rating={Number(ratingData.imdb.rating)}
          maxRating={10}
          label={`${formatRating.count(ratingData.imdb.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  if (ratingData.rottentomatoes?.series && isValidRTScore(ratingData.rottentomatoes)) {
    const rtData = ratingData.rottentomatoes.series;
    ratingCards.push(
      <div key="rottentomatoes" className="w-full">
        <RottenTomatoesCard
          criticScore={formatRating.percentage(rtData.tomatometer)}
          audienceScore={formatRating.percentage(rtData.audience_score)}
          criticReviews={formatRating.count(rtData.critics_count)}
          audienceReviews={formatRating.count(rtData.audience_count)}
          criticAvg={rtData.critics_avg !== '暂无' ? rtData.critics_avg : undefined}
          audienceAvg={rtData.audience_avg !== '暂无' ? rtData.audience_avg : undefined}
        />
      </div>
    );
  }

  if (ratingData.metacritic?.overall && isValidMCScore(ratingData.metacritic)) {
    const mcData = ratingData.metacritic.overall;
    ratingCards.push(
      <div key="metacritic" className="w-full">
        <MetacriticCard
          metascore={formatRating.number(mcData.metascore)}
          userScore={formatRating.number(mcData.userscore)}
          criticReviews={formatRating.count(mcData.critics_count)}
          userReviews={formatRating.count(mcData.users_count)}
        />
      </div>
    );
  }

  if (!selectedSeason && ratingData.letterboxd && isValidScore(ratingData.letterboxd.rating)) {
    ratingCards.push(
      <div key="letterboxd" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/letterboxd.png`}
          rating={Number(ratingData.letterboxd.rating) * 2}
          maxRating={10}
          label={`${formatRating.count(ratingData.letterboxd.rating_count)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  if (ratingData.tmdb && isValidScore(ratingData.tmdb.rating)) {
    ratingCards.push(
      <div key="tmdb" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/tmdb.png`}
          rating={Number((ratingData.tmdb.rating).toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(ratingData.tmdb.voteCount)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  if (!selectedSeason && ratingData.trakt && isValidScore(ratingData.trakt.rating)) {
    ratingCards.push(
      <div key="trakt" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/trakt.png`}
          rating={Number((ratingData.trakt.rating).toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(ratingData.trakt.votes)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundImage: `url('${CDN_URL}/background.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      className="p-8 w-[1200px] min-h-[902px] flex relative"
    >
      {/* Home Logo */}
      <div className="mt-auto ml-[-10px]">
        <img
          src={`${CDN_URL}/logos/home.png`}
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