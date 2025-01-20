import { RatingCard } from '../ratings/RatingCard';
import { RottenTomatoesCard } from '../ratings/RottenTomatoesCard';
import { MetacriticCard } from '../ratings/MetacriticCard';
import { OverallRatingCard } from '../ratings/OverallRatingCard';
import { formatRating } from '../../utils/formatRating';
import { calculateOverallRating } from '../ratings/calculateOverallrating';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';
import type {
  DoubanRating,
  IMDBRating,
  RTSeriesData,
  MCOverallData,
  TMDBRating,
  TraktRating,
} from '../../types/ratings';

interface ExportTVShowRatingCardProps {
  tvShow: TVShow;
  ratingData: TVShowRatingData;
  selectedSeason?: number;
}
interface CurrentRatings {
  douban: (DoubanRating['seasons'] extends Array<infer T> ? T : never | DoubanRating) | null;
  imdb: IMDBRating | null;
  rt: RTSeriesData | null;
  metacritic: MCOverallData | null;
  tmdb: TMDBRating | null;
  trakt: TraktRating | null;
}

export function ExportTVShowRatingCard({ 
  tvShow,
  ratingData,
  selectedSeason
}: ExportTVShowRatingCardProps) {
  // 获取当前海报 - 如果获取不到季度海报就使用剧集海报
  const currentPoster = selectedSeason 
    ? tvShow.seasons?.find(s => s.seasonNumber === selectedSeason)?.poster || tvShow.poster
    : tvShow.poster;
  // 获取当前季的评分数据
  const ratings: CurrentRatings = selectedSeason 
    ? {
        douban: ratingData.douban?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        imdb: null,  // IMDb 没有分季评分
        rt: ratingData.rottentomatoes?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        metacritic: ratingData.metacritic?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        tmdb: ratingData.tmdb?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        trakt: null  // 分季不显示 Trakt 评分
      }
    : {
        douban: ratingData.douban ?? null,
        imdb: ratingData.imdb ?? null,
        rt: ratingData.rottentomatoes?.series ?? null,
        metacritic: ratingData.metacritic?.overall ?? null,
        tmdb: ratingData.tmdb ?? null,
        trakt: ratingData.trakt ?? null
      };

  const ratingCards = [];

  // Douban
  if (ratings.douban?.rating && ratings.douban.rating !== '暂无' && Number(ratings.douban.rating) > 0) {
    ratingCards.push(
      <div key="douban" className="w-full">
        <RatingCard
          logo="/logos/douban.png"
          rating={Number(ratings.douban.rating)}
          maxRating={10}
          label={`${formatRating.count(ratings.douban.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // IMDb
  if (ratings.imdb?.rating && ratings.imdb.rating !== '暂无' && Number(ratings.imdb.rating) > 0) {
    ratingCards.push(
      <div key="imdb" className="w-full">
        <RatingCard
          logo="/logos/imdb.png"
          rating={Number(ratings.imdb.rating)}
          maxRating={10}
          label={`${formatRating.count(ratings.imdb.rating_people)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // Rotten Tomatoes
  if (ratings.rt && (
    (ratings.rt.tomatometer !== '暂无' && ratings.rt.tomatometer !== '0') || 
    (ratings.rt.audience_score !== '暂无' && ratings.rt.audience_score !== '0')
  )) {
    ratingCards.push(
      <div key="rottentomatoes" className="w-full">
        <RottenTomatoesCard
          criticScore={formatRating.percentage(ratings.rt.tomatometer)}
          audienceScore={formatRating.percentage(ratings.rt.audience_score)}
          criticReviews={formatRating.count(ratings.rt.critics_count)}
          audienceReviews={formatRating.count(ratings.rt.audience_count)}
          criticAvg={ratings.rt.critics_avg !== '暂无' ? ratings.rt.critics_avg : undefined}
          audienceAvg={ratings.rt.audience_avg !== '暂无' ? ratings.rt.audience_avg : undefined}
        />
      </div>
    );
  }

  // Metacritic
  if (ratings.metacritic && (
    ratings.metacritic.metascore !== '暂无' || 
    ratings.metacritic.userscore !== '暂无'
  )) {
    ratingCards.push(
      <div key="metacritic" className="w-full">
        <MetacriticCard
          metascore={formatRating.number(ratings.metacritic.metascore)}
          userScore={formatRating.number(ratings.metacritic.userscore)}
          criticReviews={formatRating.count(ratings.metacritic.critics_count)}
          userReviews={formatRating.count(ratings.metacritic.users_count)}
        />
      </div>
    );
  }

  // Letterboxd (只在整体评分时显示)
  if (!selectedSeason && ratingData.letterboxd?.rating) {
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
  if (ratings.tmdb?.rating && Number(ratings.tmdb.rating) > 0) {
    ratingCards.push(
      <div key="tmdb" className="w-full">
        <RatingCard
          logo="/logos/tmdb.png"
          rating={Number((ratings.tmdb.rating).toFixed(1))}
          maxRating={10}
          label={selectedSeason ? undefined : `${formatRating.count(ratings.tmdb.voteCount)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }
  
  // Trakt 评分卡片 - 只在整体评分时显示
  if (!selectedSeason && ratingData.trakt?.rating && Number(ratingData.trakt.rating) > 0) {
    ratingCards.push(
      <div key="trakt" className="w-full">
        <RatingCard
          logo="/logos/trakt.png"
          rating={Number((ratingData.trakt.rating).toFixed(1))}
          maxRating={10}
          label={`${formatRating.count(ratingData.trakt?.votes)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }

  // 只在导出整部剧集时计算综合评分
  const { rating: overallRating } = !selectedSeason ? calculateOverallRating(ratingData) : { rating: null };
  const validPlatformsCount = ratingCards.length;

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
            src={currentPoster || '/fallback-poster.jpg'}
            alt={tvShow.title}
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
            {tvShow.title} <span className="text-gray-500">({tvShow.year})</span>
            {selectedSeason && (
              <span className="text-gray-500"> - 第 {selectedSeason} 季</span>
            )}
          </h1>
        </div>
        {!selectedSeason && overallRating && (
          <div className="mt-4 mb-4">
            <OverallRatingCard 
              rating={overallRating}
              validPlatformsCount={validPlatformsCount}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-5">
          {ratingCards}
        </div>
      </div>
    </div>
  );
}