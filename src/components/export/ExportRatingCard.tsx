// ==========================================
// 电影导出卡片组件 - 用于生成PNG图片的评分卡片
// ==========================================
import { RatingCard } from '../ratings/RatingCard';
import { RottenTomatoesCard } from '../ratings/RottenTomatoesCard';
import { MetacriticCard } from '../ratings/MetacriticCard';
import { OverallRatingCard } from '../ratings/OverallRatingCard';
import { formatRating } from '../../utils/formatRating';
import type { RatingData } from '../../types/ratings';
import { calculateOverallRating } from '../ratings/calculateOverallrating';
import { isValidRatingData } from '../../utils/ratingHelpers';

interface ExportRatingCardProps {
  media: {
    title: string;
    year: string;
    poster: string;
  };
  ratingData: RatingData;
  selectedSeason?: number;
}

export function ExportRatingCard({ media, ratingData, selectedSeason }: ExportRatingCardProps) {
  if (!media || !ratingData) {
    return null;
  }

  const ratingCards = [];
  
  // 计算综合评分
  const { rating: overallRating, validRatings: validPlatformsCount } = calculateOverallRating(ratingData);

  // 只有在评分有效时才添加对应的评分卡片
  // 豆瓣评分
  if (ratingData.douban && isValidRatingData(ratingData.douban.rating)) {
    ratingCards.push(
      <div key="douban" className="w-full">
        <RatingCard
          logo={`/logos/douban.png`}
          rating={Number(ratingData.douban.rating)}
          maxRating={10}
          label={`${formatRating.count(ratingData.douban.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // IMDB 评分
  if (ratingData.imdb && isValidRatingData(ratingData.imdb.rating)) {
    ratingCards.push(
      <div key="imdb" className="w-full">
        <RatingCard
          logo={`/logos/imdb.png`}
          rating={Number(ratingData.imdb.rating)}
          maxRating={10}
          label={`${formatRating.count(ratingData.imdb.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // Rotten Tomatoes 评分
  if (ratingData.rottentomatoes?.series && isValidRatingData(ratingData.rottentomatoes.series.tomatometer)) {
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

  // Metacritic 评分
  if (ratingData.metacritic?.overall && isValidRatingData(ratingData.metacritic.overall.metascore)) {
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

  // Letterboxd 评分
  if (!selectedSeason && ratingData.letterboxd && isValidRatingData(ratingData.letterboxd.rating)) {
    ratingCards.push(
      <div key="letterboxd" className="w-full">
        <RatingCard
          logo={`/logos/letterboxd.png`}
          rating={Number(ratingData.letterboxd.rating) * 2}
          maxRating={10}
          label={`${formatRating.count(ratingData.letterboxd.rating_count)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // TMDB 评分
  if (ratingData.tmdb && isValidRatingData(ratingData.tmdb.rating)) {
    ratingCards.push(
      <div key="tmdb" className="w-full">
        <RatingCard
          logo={`/logos/tmdb.png`}
          rating={Number((ratingData.tmdb.rating).toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(ratingData.tmdb.voteCount)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // Trakt 评分
  if (!selectedSeason && ratingData.trakt && isValidRatingData(ratingData.trakt.rating)) {
    ratingCards.push(
      <div key="trakt" className="w-full">
        <RatingCard
          logo={`/logos/trakt.png`}
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
    <div className="export-glass-container w-[1200px] min-h-[902px] relative">
      <div className="export-glass-card p-8 flex relative">
        {/* 左侧海报区域 - 完整的毛玻璃容器（叠加在主卡片上） */}
        <div className="w-[300px] ml-[-20px] relative z-20">
          <div className="export-poster-glass-divider w-full h-full min-h-[800px] rounded-2xl p-6 relative">
            {/* 海报容器 - 完全居中，圆角 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-[260px] h-[390px] flex-shrink-0 rounded-2xl overflow-hidden">
                <img
                  src={media.poster || '/fallback-poster.jpg'}
                  alt={media.title}
                  className="w-full h-full object-cover rounded-2xl"
                  crossOrigin="anonymous"
                  loading="eager"
                />
              </div>
            </div>
            
            {/* 首页Logo - 左下角 */}
            <div className="absolute bottom-6 left-6" style={{ zIndex: 100 }}>
              <img
                src="/logos/home.png"
                alt="Home"
                className="w-8 h-8 object-contain"
                crossOrigin="anonymous"
                style={{ display: 'block' }}
              />
            </div>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 ml-20">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
              {media.title} <span className="text-gray-500 dark:text-gray-300">({media.year})</span>
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
    </div>
  );
}