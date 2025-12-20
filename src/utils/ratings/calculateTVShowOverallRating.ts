// ==========================================
// 剧集整体评分计算
// ==========================================
import { TVShowRatingData } from '../../types/ratings';
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

export function calculateTVShowOverallRating(ratingData: TVShowRatingData) {
  const state = createRatingCalculationState();
  const medianVoteCount = calculateMedianVoteCount(ratingData);

  // 处理整剧评分
  processDoubanRating(ratingData, medianVoteCount, state);
  processIMDBRating(ratingData, medianVoteCount, state);
  processRottenTomatoesRating(ratingData, medianVoteCount, state);
  processMetacriticRating(ratingData, medianVoteCount, state);
  processTMDBRating(ratingData, medianVoteCount, state);
  processTraktRating(ratingData, medianVoteCount, state);
  processLetterboxdRating(ratingData, medianVoteCount, state);

  const finalRating = calculateFinalRating(state);

  if (process.env.NODE_ENV === 'development') {
    console.log('剧集计算详情:', {
      中位数评分人数: medianVoteCount,
      各平台评分详情: state.ratingDetails,
      评分总和: state.ratingTimesVoteSum,
      总评分人数: state.totalVoteCount,
      有效平台数: state.validPlatforms.length,
      参与计算的平台: state.validPlatforms,
      最终评分: finalRating,
      原始评分数据: {
        douban: ratingData.douban,
        imdb: ratingData.imdb,
        rottenTomatoes: ratingData.rottentomatoes?.series,
        metacritic: ratingData.metacritic?.overall,
        tmdb: ratingData.tmdb,
        trakt: ratingData.trakt,
        letterboxd: ratingData.letterboxd
      }
    });
  }

  return {
    rating: finalRating,
    validRatings: state.validPlatforms.length,
    platforms: state.validPlatforms
  };
}
