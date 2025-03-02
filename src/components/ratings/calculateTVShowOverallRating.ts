// ==========================================
// 计算整剧综合评分
// ==========================================
import { TVShowRatingData } from '../../types/ratings';
import { isValidRatingData, calculateMedianVoteCount, normalizeRating } from '../../utils/ratingHelpers';

export function calculateTVShowOverallRating(ratingData: TVShowRatingData) {
  let ratingTimesVoteSum = 0;
  let totalVoteCount = 0;      
  const validPlatforms: string[] = [];  
  const ratingDetails: any[] = [];
  
  const medianVoteCount = calculateMedianVoteCount(ratingData);

// 豆瓣评分
if (isValidRatingData(ratingData.douban?.rating)) {
  const rating = parseFloat(ratingData.douban?.rating || '0');
  const voteCount = ratingData.douban?.rating_people 
    ? parseFloat(ratingData.douban.rating_people.replace(/[^0-9]/g, ''))
    : medianVoteCount;
  ratingTimesVoteSum += rating * voteCount;
  totalVoteCount += voteCount;
  if (!validPlatforms.includes('douban')) {
    validPlatforms.push('douban');
  }
  ratingDetails.push({
    platform: 'douban',
    originalRating: ratingData.douban?.rating,
    normalizedRating: rating,
    voteCount,
    contribution: rating * voteCount
  });
}

  // IMDB评分
  if (isValidRatingData(ratingData.imdb?.rating)) {
    const rating = normalizeRating(ratingData.imdb?.rating, 'imdb') ?? 0;
    const voteCount = ratingData.imdb?.rating_people 
      ? parseFloat(ratingData.imdb.rating_people.replace(/[^0-9]/g, ''))
      : medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    validPlatforms.push('imdb');
    ratingDetails.push({
      platform: 'imdb',
      originalRating: ratingData.imdb?.rating,
      normalizedRating: rating,
      voteCount,
      contribution: rating * voteCount
    });
  }

  // 烂番茄评分
  if (ratingData.rottentomatoes?.series) {
    const rt = ratingData.rottentomatoes.series;
    // 优先使用平均分，如果没有则使用百分比评分
    // 专业评分
    if (isValidRatingData(rt.critics_avg)) {
      const rating = normalizeRating(rt.critics_avg, 'rottentomatoes') ?? 0;
      const criticsCount = rt.critics_count 
        ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_critics',
        originalRating: rt.critics_avg,
        normalizedRating: rating,
        voteCount: criticsCount,
        contribution: rating * criticsCount
      });
    } else if (isValidRatingData(rt.tomatometer)) {
      const rating = normalizeRating(rt.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
      const criticsCount = rt.critics_count 
        ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_critics',
        originalRating: rt.tomatometer,
        normalizedRating: rating,
        voteCount: criticsCount,
        contribution: rating * criticsCount
      });
    }
    
    // 用户评分
    if (isValidRatingData(rt.audience_avg)) {
      const rating = normalizeRating(rt.audience_avg, 'rottentomatoes', 'audience_avg') ?? 0;
      const audienceCount = rt.audience_count
        ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * audienceCount;
      totalVoteCount += audienceCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_audience',
        originalRating: rt.audience_avg,
        normalizedRating: rating,
        voteCount: audienceCount,
        contribution: rating * audienceCount
      });
    } else if (isValidRatingData(rt.audience_score)) {
      const rating = normalizeRating(rt.audience_score, 'rottentomatoes', 'percentage') ?? 0;
      const audienceCount = rt.audience_count
        ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * audienceCount;
      totalVoteCount += audienceCount;
      if (!validPlatforms.includes('rottentomatoes')) {
        validPlatforms.push('rottentomatoes');
      }
      ratingDetails.push({
        platform: 'rottentomatoes_audience',
        originalRating: rt.audience_score,
        normalizedRating: rating,
        voteCount: audienceCount,
        contribution: rating * audienceCount
      });
    }
  }

  // Metacritic评分
  if (ratingData.metacritic?.overall) {
    const mc = ratingData.metacritic.overall;
    // 专业评分
    if (isValidRatingData(mc.metascore)) {
      const rating = normalizeRating(mc.metascore, 'metacritic', 'metascore') ?? 0;
      const criticsCount = mc.critics_count
        ? parseFloat(mc.critics_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      if (!validPlatforms.includes('metacritic')) {
        validPlatforms.push('metacritic');
      }
      ratingDetails.push({
        platform: 'metacritic_critics',
        originalRating: mc.metascore,
        normalizedRating: rating,
        voteCount: criticsCount,
        contribution: rating * criticsCount
      });
    }
    // 用户评分
    if (isValidRatingData(mc.userscore)) {
      const rating = normalizeRating(mc.userscore, 'metacritic', 'userscore') ?? 0;
      const usersCount = mc.users_count
        ? parseFloat(mc.users_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * usersCount;
      totalVoteCount += usersCount;
      if (!validPlatforms.includes('metacritic')) {
        validPlatforms.push('metacritic');
      }
      ratingDetails.push({
        platform: 'metacritic_users',
        originalRating: mc.userscore,
        normalizedRating: rating,
        voteCount: usersCount,
        contribution: rating * usersCount
      });
    }
  }

  // TMDB评分
  if (isValidRatingData(ratingData.tmdb?.rating)) {
    const rating = normalizeRating(ratingData.tmdb?.rating, 'tmdb') ?? 0;
    const voteCount = ratingData.tmdb?.voteCount ?? medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    if (!validPlatforms.includes('tmdb')) {
      validPlatforms.push('tmdb');
    }
    ratingDetails.push({
      platform: 'tmdb',
      originalRating: ratingData.tmdb?.rating,
      normalizedRating: rating,
      voteCount,
      contribution: rating * voteCount
    });
  }

  // Trakt评分
  if (isValidRatingData(ratingData.trakt?.rating)) {
    const rating = normalizeRating(ratingData.trakt?.rating, 'trakt') ?? 0;
    const voteCount = ratingData.trakt?.votes ?? medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    if (!validPlatforms.includes('trakt')) {
      validPlatforms.push('trakt');
    }
    ratingDetails.push({
      platform: 'trakt',
      originalRating: ratingData.trakt?.rating,
      normalizedRating: rating,
      voteCount,
      contribution: rating * voteCount
    });
  }

  // Letterboxd评分
  if (isValidRatingData(ratingData.letterboxd?.rating)) {
    const rating = normalizeRating(ratingData.letterboxd?.rating, 'letterboxd') ?? 0;
    const voteCount = ratingData.letterboxd?.rating_count 
      ? parseFloat(ratingData.letterboxd.rating_count.replace(/[^0-9]/g, ''))
      : medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    if (!validPlatforms.includes('letterboxd')) {
      validPlatforms.push('letterboxd');
    }
    ratingDetails.push({
      platform: 'letterboxd',
      originalRating: ratingData.letterboxd?.rating,
      normalizedRating: rating,
      voteCount,
      contribution: rating * voteCount
    });
  }

  const finalRating = totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;

  // 详细的调试日志
  console.log('剧集计算详情:', {
    中位数评分人数: medianVoteCount,
    各平台评分详情: ratingDetails,
    评分总和: ratingTimesVoteSum,
    总评分人数: totalVoteCount,
    有效平台数: validPlatforms.length,
    参与计算的平台: validPlatforms,
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

  return {
    rating: finalRating,
    validRatings: validPlatforms.length,
    platforms: validPlatforms
  };
} 
