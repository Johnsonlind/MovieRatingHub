import { RatingCard } from '../ratings/RatingCard';
import { RottenTomatoesCard } from '../ratings/RottenTomatoesCard';
import { MetacriticCard } from '../ratings/MetacriticCard';
import { OverallRatingCard } from '../ratings/OverallRatingCard';
import { formatRating } from '../../utils/formatRating';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';
import { CDN_URL } from '../../lib/config';
import type {
  DoubanRating,
  IMDBRating,
  RTSeriesData,
  MCOverallData,
  TMDBRating,
  TraktRating,
} from '../../types/ratings';
import { calculateSeasonRating } from '../../lib/utils/calculateSeasonRating';
import { calculateOverallRating } from '../ratings/calculateOverallrating';

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
  letterboxd: {
    status: string;
    rating: string;
    rating_count: string;
  } | null;
}

// 检查评分是否有效的辅助函数
const isValidScore = (score: string | number | undefined | null): boolean => {
  if (score === undefined || score === null || score === '暂无' || score === 0) return false;
  return !isNaN(Number(score)) && Number(score) > 0;
};

// 检查 RT 评分是否有效
const isValidRTScore = (rt: RTSeriesData | null) => {
  if (!rt) return false;
  return (
    (rt.tomatometer !== '暂无' && rt.tomatometer !== '0') ||
    (rt.audience_score !== '暂无' && rt.audience_score !== '0') ||
    (rt.critics_avg !== '暂无') ||
    (rt.audience_avg !== '暂无')
  );
};

// 检查 Metacritic 评分是否有效
const isValidMCScore = (mc: MCOverallData | null) => {
  if (!mc) return false;
  return (
    (mc.metascore !== '暂无' && mc.metascore !== 'tbd' && Number(mc.metascore) > 0) ||
    (mc.userscore !== '暂无' && mc.userscore !== 'tbd' && Number(mc.userscore) > 0)
  );
};

export function ExportTVShowRatingCard({ 
  tvShow,
  ratingData,
  selectedSeason
}: ExportTVShowRatingCardProps) {
  // 获取当前海报
  const currentPoster = selectedSeason 
    ? tvShow.seasons?.find(s => s.seasonNumber === selectedSeason)?.poster || tvShow.poster
    : tvShow.poster;

  // 获取当前季的评分数据
  const ratings: CurrentRatings = selectedSeason 
    ? {
        douban: ratingData.douban?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        imdb: null,
        rt: ratingData.rottentomatoes?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        metacritic: ratingData.metacritic?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        tmdb: ratingData.tmdb?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        trakt: ratingData.trakt?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        letterboxd: null
      }
    : {
        douban: ratingData.douban ?? null,
        imdb: ratingData.imdb ?? null,
        rt: ratingData.rottentomatoes?.series ?? null,
        metacritic: ratingData.metacritic?.overall ?? null,
        tmdb: ratingData.tmdb ?? null,
        trakt: ratingData.trakt ?? null,
        letterboxd: ratingData.letterboxd ?? null
      };

  const ratingCards = [];

  // Douban
  if (ratings.douban && isValidScore(ratings.douban.rating)) {
    ratingCards.push(
      <div key="douban" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/douban.png`}
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
  if (!selectedSeason && ratings.imdb && isValidScore(ratings.imdb.rating)) {
    ratingCards.push(
      <div key="imdb" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/imdb.png`}
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
  if (ratings.rt && isValidRTScore(ratings.rt)) {
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
  if (ratings.metacritic && isValidMCScore(ratings.metacritic)) {
    const metascore = formatRating.number(ratings.metacritic.metascore);
    const userScore = formatRating.number(ratings.metacritic.userscore);
    
    if (metascore > 0 || userScore > 0) {
      ratingCards.push(
        <div key="metacritic" className="w-full">
          <MetacriticCard
            metascore={metascore > 0 ? metascore : undefined}
            userScore={userScore > 0 ? userScore : undefined}
            criticReviews={formatRating.count(ratings.metacritic.critics_count)}
            userReviews={formatRating.count(ratings.metacritic.users_count)}
          />
        </div>
      );
    }
  }

  // Letterboxd (只在整体评分时显示)
  if (!selectedSeason && 
      ratingData.letterboxd && 
      isValidScore(ratingData.letterboxd.rating) && 
      ratingData.letterboxd.status === 'Successful') {
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

  // TMDB
  if (ratings.tmdb && isValidScore(ratings.tmdb.rating)) {
    ratingCards.push(
      <div key="tmdb" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/tmdb.png`}
          rating={Number((ratings.tmdb.rating).toFixed(1))}
          maxRating={10}
          label={selectedSeason ? undefined : `${formatRating.count(ratings.tmdb.voteCount)} 人评分`}
          showStars
          className="h-full"
        />
      </div>
    );
  }
  
  // Trakt
  if (ratings.trakt && isValidScore(ratings.trakt.rating)) {
    ratingCards.push(
      <div key="trakt" className="w-full">
        <RatingCard
          logo={`${CDN_URL}/logos/trakt.png`}
          rating={Number((ratings.trakt.rating).toFixed(1))}
          maxRating={10}
          label={selectedSeason ? undefined : `${formatRating.count(ratings.trakt?.votes)} 人评分`}
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
        
        {/* 综合评分显示 */}
        <div className="mt-4 mb-6">
          <OverallRatingCard 
            rating={selectedSeason 
              ? calculateSeasonRating(ratingData, selectedSeason).rating || 0
              : calculateOverallRating(ratingData, 'tvshow').rating || 0
            }
            validPlatformsCount={selectedSeason 
              ? calculateSeasonRating(ratingData, selectedSeason).validRatings
              : calculateOverallRating(ratingData, 'tvshow').validRatings
            }
          />
        </div>

        {/* 评分卡片网格布局 */}
        <div className="grid grid-cols-2 gap-5">
          {ratingCards}
        </div>
      </div>
    </div>
  );
}