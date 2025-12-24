// ==========================================
// 综合评分计算
// ==========================================
import type { RatingData, TVShowRatingData } from '../../types/ratings';
import { calculateMedianVoteCount } from '../ratingHelpers';
import {
  createRatingCalculationState,
  calculateFinalRating,
  processDoubanRating,
  processIMDBRating,
  processRottenTomatoesRating,
  processMetacriticRating,
  processTMDBRating,
  processTraktRating,
  processLetterboxdRating
} from '../ratingCalculators';

export function calculateOverallRating(
  ratingData: RatingData | TVShowRatingData,
  type: 'movie' | 'tvshow' = 'movie'
): { rating: number | null; validRatings: number; platforms: string[] } {
  if (!ratingData) return { rating: null, validRatings: 0, platforms: [] };

  const state = createRatingCalculationState();
  const medianVoteCount = calculateMedianVoteCount(ratingData);

  if (type === 'movie') {
    // 处理电影评分
    processDoubanRating(ratingData, medianVoteCount, state);
    processIMDBRating(ratingData, medianVoteCount, state);
    processRottenTomatoesRating(ratingData, medianVoteCount, state);
    processMetacriticRating(ratingData, medianVoteCount, state);
    processTMDBRating(ratingData, medianVoteCount, state);
    processTraktRating(ratingData, medianVoteCount, state);
    processLetterboxdRating(ratingData, medianVoteCount, state);
  } 
  // 处理剧集评分
  else {
    const tvData = ratingData as TVShowRatingData;
    
    // 处理整剧评分
    processDoubanRating(tvData, medianVoteCount, state);
    processIMDBRating(tvData, medianVoteCount, state);
    processRottenTomatoesRating(tvData, medianVoteCount, state);
    processMetacriticRating(tvData, medianVoteCount, state);
    processLetterboxdRating(tvData, medianVoteCount, state);
    processTMDBRating(tvData, medianVoteCount, state);
    processTraktRating(tvData, medianVoteCount, state);

    // 处理分季评分
    if (tvData.douban?.seasons) {
      tvData.douban.seasons.forEach(season => {
        processDoubanRating(
          tvData,
          medianVoteCount,
          state,
          season.season_number
        );
      });
    }

    if (tvData.rottentomatoes?.seasons) {
      tvData.rottentomatoes.seasons.forEach(season => {
        processRottenTomatoesRating(
          tvData,
          medianVoteCount,
          state,
          season.season_number
        );
      });
    }

    if (tvData.metacritic?.seasons) {
      tvData.metacritic.seasons.forEach(season => {
        processMetacriticRating(
          tvData,
          medianVoteCount,
          state,
          season.season_number
        );
      });
    }

    if (tvData.tmdb?.seasons) {
      tvData.tmdb.seasons.forEach(season => {
        processTMDBRating(
          tvData,
          medianVoteCount,
          state,
          season.season_number
        );
      });
    }

    if (tvData.trakt?.seasons) {
      tvData.trakt.seasons.forEach(season => {
        processTraktRating(
          tvData,
          medianVoteCount,
          state,
          season.season_number
        );
      });
    }
  }

  const finalRating = calculateFinalRating(state);

  if (process.env.NODE_ENV === 'development') {
    console.log('综合评分计算详情:', {
      类型: type,
      中位数评分人数: medianVoteCount,
      各平台评分详情: state.ratingDetails,
      评分总和: state.ratingTimesVoteSum,
      总评分人数: state.totalVoteCount,
      有效平台数: state.validPlatforms.length,
      参与计算的平台: state.validPlatforms,
      最终评分: finalRating,
      原始评分数据: type === 'movie' ? {
        douban: ratingData.douban,
        imdb: ratingData.imdb,
        rottenTomatoes: ratingData.rottentomatoes?.series,
        metacritic: ratingData.metacritic?.overall,
        tmdb: ratingData.tmdb,
        trakt: ratingData.trakt,
        letterboxd: ratingData.letterboxd
      } : {
        整剧评分: {
          douban: ratingData.douban,
          imdb: ratingData.imdb,
          rottenTomatoes: ratingData.rottentomatoes?.series,
          metacritic: ratingData.metacritic?.overall,
          tmdb: ratingData.tmdb,
          trakt: ratingData.trakt,
          letterboxd: ratingData.letterboxd
        },
        分季评分: {
          douban: (ratingData as TVShowRatingData).douban?.seasons,
          rottenTomatoes: (ratingData as TVShowRatingData).rottentomatoes?.seasons,
          metacritic: (ratingData as TVShowRatingData).metacritic?.seasons,
          tmdb: (ratingData as TVShowRatingData).tmdb?.seasons,
          trakt: (ratingData as TVShowRatingData).trakt?.seasons
        }
      }
    });
  }

  return {
    rating: finalRating,
    validRatings: state.validPlatforms.length,
    platforms: state.validPlatforms
  };
}
