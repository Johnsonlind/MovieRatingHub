// ==========================================
// 计算分季综合评分
// ==========================================
import { SeasonRatingData } from '../../types/ratings';
import { isValidRatingData, calculateMedianVoteCount, normalizeRating } from '../../utils/ratingHelpers';

export function calculateSeasonRating(ratings: SeasonRatingData, seasonNumber: number) {
  let ratingTimesVoteSum = 0;
  let totalVoteCount = 0;
  const validPlatforms: string[] = [];
  const ratingDetails: any[] = [];

  const medianVoteCount = calculateMedianVoteCount(ratings);

  // 豆瓣分季评分
  const doubanSeason = ratings.douban?.seasons?.find(s => s.season_number === seasonNumber);
  if (isValidRatingData(doubanSeason?.rating)) {
    const rating = normalizeRating(doubanSeason?.rating, 'douban') ?? 0;
    const rating_people = doubanSeason?.rating_people 
      ? parseFloat(doubanSeason?.rating_people.replace(/[^0-9]/g, ''))
      : medianVoteCount;
    ratingTimesVoteSum += rating * rating_people;
    totalVoteCount += rating_people;
    if (!validPlatforms.includes('douban')) {
      validPlatforms.push('douban');
    }
    ratingDetails.push({
      platform: 'douban',
      originalRating: doubanSeason?.rating,
      normalizedRating: rating,
      voteCount: rating_people,
      contribution: rating * rating_people
    });
  }

  // 烂番茄分季评分
  const rtSeason = (ratings as any).rottentomatoes?.seasons?.find((s: any) => s.season_number === seasonNumber);
  if (rtSeason) {
    // 专业评分
    if (isValidRatingData(rtSeason.critics_avg)) {
      const rating = normalizeRating(rtSeason.critics_avg, 'rottentomatoes') ?? 0;
      const criticsCount = rtSeason.critics_count 
        ? parseFloat(rtSeason.critics_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_critics',
        originalRating: rtSeason.critics_avg,
        normalizedRating: rating,
        voteCount: criticsCount,
        contribution: rating * criticsCount
      });
    } else if (isValidRatingData(rtSeason.tomatometer)) {
      const rating = normalizeRating(rtSeason.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
      const criticsCount = rtSeason.critics_count 
        ? parseFloat(rtSeason.critics_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_tomatometer',
        originalRating: rtSeason.tomatometer,
        normalizedRating: rating,
        voteCount: criticsCount,
        contribution: rating * criticsCount
      });
    }
    
    // 用户评分
    if (isValidRatingData(rtSeason.audience_avg)) {
      const rating = normalizeRating(rtSeason.audience_avg, 'rottentomatoes', 'audience_avg') ?? 0;
      const audienceCount = rtSeason.audience_count
        ? parseFloat(rtSeason.audience_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * audienceCount;
      totalVoteCount += audienceCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_audience',
        originalRating: rtSeason.audience_avg,
        normalizedRating: rating,
        voteCount: audienceCount,
        contribution: rating * audienceCount
      });
    } else if (isValidRatingData(rtSeason.audience_score)) {
      const rating = normalizeRating(rtSeason.audience_score, 'rottentomatoes', 'percentage') ?? 0;
      const audienceCount = rtSeason.audience_count
        ? parseFloat(rtSeason.audience_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * audienceCount;
      totalVoteCount += audienceCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_audience_score',
        originalRating: rtSeason.audience_score,
        normalizedRating: rating,
        voteCount: audienceCount,
        contribution: rating * audienceCount
      });
    }
  }

  // Metacritic分季评分
  const mcSeason = ratings.metacritic?.seasons?.find(s => s.season_number === seasonNumber);
  if (mcSeason) {
    // 专业评分
    if (isValidRatingData(mcSeason.metascore)) {
      const rating = normalizeRating(mcSeason.metascore, 'metacritic', 'metascore') ?? 0;
      const criticsCount = mcSeason.critics_count
        ? parseFloat(mcSeason.critics_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      if (!validPlatforms.includes('metacritic')) {
        validPlatforms.push('metacritic');
      }
      ratingDetails.push({
        platform: 'metacritic_critics',
        originalRating: mcSeason.metascore,
        normalizedRating: rating,
        voteCount: criticsCount,
        contribution: rating * criticsCount
      });
    }

    // 用户评分
    if (isValidRatingData(mcSeason.userscore)) {
      const rating = normalizeRating(mcSeason.userscore, 'metacritic', 'userscore') ?? 0;
      const usersCount = mcSeason.users_count
        ? parseFloat(mcSeason.users_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * usersCount;
      totalVoteCount += usersCount;
      if (!validPlatforms.includes('metacritic')) {
        validPlatforms.push('metacritic');
      }
      ratingDetails.push({
        platform: 'metacritic_userscore',
        originalRating: mcSeason.userscore,
        normalizedRating: rating,
        voteCount: usersCount,
        contribution: rating * usersCount
      });
    }
  }

  // TMDB分季评分
  const tmdbSeason = ratings.tmdb?.seasons?.find(s => s.season_number === seasonNumber);
  if (isValidRatingData(tmdbSeason?.rating)) {
    const rating = tmdbSeason?.rating || 0;
    const voteCount = tmdbSeason?.voteCount || medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    if (!validPlatforms.includes('tmdb')) {
      validPlatforms.push('tmdb');
    }
    ratingDetails.push({
      platform: 'tmdb',
      originalRating: tmdbSeason?.rating,
      normalizedRating: rating,
      voteCount: voteCount,
      contribution: rating * voteCount
    });
  }

  // Trakt分季评分
  const traktSeason = ratings.trakt?.seasons?.find(s => s.season_number === seasonNumber);
  if (isValidRatingData(traktSeason?.rating)) {
    const rating = traktSeason?.rating || 0;
    const voteCount = traktSeason?.votes || medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    if (!validPlatforms.includes('trakt')) {
      validPlatforms.push('trakt');
    }
    ratingDetails.push({
      platform: 'trakt',
      originalRating: traktSeason?.rating,
      normalizedRating: rating,
      voteCount: voteCount,
      contribution: rating * voteCount
    });
  }

  const finalRating = totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;

  // 调试日志
  console.log('分季评分计算详情:', {
    季数: seasonNumber,
    中位数评分人数: medianVoteCount,
    各平台评分详情: ratingDetails,
    评分总和: ratingTimesVoteSum,
    总评分人数: totalVoteCount,
    有效平台数: validPlatforms.length,
    参与计算的平台: validPlatforms,
    最终评分: finalRating,
    原始评分数据: {
      douban: ratings.douban?.seasons?.find((s: { season_number: number }) => s.season_number === seasonNumber),
      rottenTomatoes: ratings.rottentomatoes?.seasons?.find((s: { season_number: number }) => s.season_number === seasonNumber),
      metacritic: ratings.metacritic?.seasons?.find((s: { season_number: number }) => s.season_number === seasonNumber),
      tmdb: ratings.tmdb?.seasons?.find((s: { season_number: number }) => s.season_number === seasonNumber),
      trakt: ratings.trakt?.seasons?.find((s: { season_number: number }) => s.season_number === seasonNumber)
    }
  });

  return {
    rating: finalRating,
    validRatings: validPlatforms.length,
    platforms: validPlatforms
  };
}
