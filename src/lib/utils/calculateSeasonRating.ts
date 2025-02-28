interface SeasonRatingData {
  douban?: {
    rating?: string;
    rating_people?: string;
    seasons?: Array<{
      season_number: number;
      rating: string;
      rating_people: string;
    }>;
  };
  rottentomatoes?: {
    tomatometer?: string;
    audience_score?: string;
    critics_avg?: string;
    audience_avg?: string;
    critics_count?: string;
    audience_count?: string;
    seasons?: Array<{
      season_number: number;
      tomatometer: string;
      audience_score: string;
      critics_avg: string;
      audience_avg: string;
      critics_count: string;
      audience_count: string;
    }>;
  };
  metacritic?: {
    metascore?: string;
    userscore?: string;
    critics_count?: string;
    users_count?: string;
    seasons?: Array<{
      season_number: number;
      metascore: string;
      userscore: string;
      critics_count: string;
      users_count: string;
    }>;
  };
  tmdb?: {
    rating?: number;
    voteCount?: number;
    seasons?: Array<{
      season_number: number;
      rating: number;
      voteCount: number;
    }>;
  };
  trakt?: {
    rating?: number;
    votes?: number;
    seasons?: Array<{
      season_number: number;
      rating: number;
      votes: number;
      distribution?: Record<string, number>;
    }>;
  };
}

// 辅助函数:计算评分人数的中位数
function calculateMedianVoteCount(ratings: SeasonRatingData): number {
  const voteCounts = [];
  
  // 收集所有有效的评分人数
  if (ratings.douban?.rating_people) {
    voteCounts.push(parseFloat(ratings.douban.rating_people.replace(/[^0-9]/g, '')));
  }
  if (ratings.rottentomatoes?.critics_count) {
    voteCounts.push(parseFloat(ratings.rottentomatoes.critics_count.replace(/[^0-9]/g, '')));
  }
  if (ratings.rottentomatoes?.audience_count) {
    // 处理 "10,000+ Ratings" 这样的格式
    const count = ratings.rottentomatoes.audience_count.replace(/[^0-9]/g, '');
    voteCounts.push(parseFloat(count));
  }
  if (ratings.metacritic?.critics_count) {
    voteCounts.push(parseFloat(ratings.metacritic.critics_count));
  }
  if (ratings.metacritic?.users_count) {
    voteCounts.push(parseFloat(ratings.metacritic.users_count));
  }
  if (ratings.trakt?.votes) {
    voteCounts.push(ratings.trakt.votes);
  }

  // 如果没有任何有效评分人数,尝试从其他季度获取中位数
  if (voteCounts.length === 0) {
    // 从其他季度收集评分人数
    const allSeasonVoteCounts: number[] = [];
    
    // 收集豆瓣其他季度评分人数
    ratings.douban?.seasons?.forEach((season: { rating_people: string }) => {
      if (season.rating_people) {
        allSeasonVoteCounts.push(parseFloat(season.rating_people.replace(/[^0-9]/g, '')));
      }
    });
    // 收集烂番茄其他季度评分人数
    ratings.rottentomatoes?.seasons?.forEach((season: { critics_count?: string; audience_count?: string }) => {
      if (season.critics_count) {
        allSeasonVoteCounts.push(parseFloat(season.critics_count.replace(/[^0-9]/g, '')));
      }
      if (season.audience_count) {
        allSeasonVoteCounts.push(parseFloat(season.audience_count.replace(/[^0-9]/g, '')));
      }
    });

    // 收集Metacritic其他季度评分人数
    ratings.metacritic?.seasons?.forEach(season => {
      if (season.critics_count) {
        allSeasonVoteCounts.push(parseFloat(season.critics_count));
      }
      if (season.users_count) {
        allSeasonVoteCounts.push(parseFloat(season.users_count));
      }
    });

    // 收集Trakt其他季度评分人数
    ratings.trakt?.seasons?.forEach(season => {
      if (season.votes) {
        allSeasonVoteCounts.push(season.votes);
      }
    });

    if (allSeasonVoteCounts.length > 0) {
      // 计算所有季度评分人数的中位数
      allSeasonVoteCounts.sort((a, b) => a - b);
      const mid = Math.floor(allSeasonVoteCounts.length / 2);
      return allSeasonVoteCounts.length % 2 === 0 
        ? (allSeasonVoteCounts[mid - 1] + allSeasonVoteCounts[mid]) / 2
        : allSeasonVoteCounts[mid];
    }
    
    // 如果实在没有任何评分人数数据,返回一个保守的默认值
    return 1000;
  }
  
  // 计算当前季度评分人数的中位数
  voteCounts.sort((a, b) => a - b);
  const mid = Math.floor(voteCounts.length / 2);
  return voteCounts.length % 2 === 0 
    ? (voteCounts[mid - 1] + voteCounts[mid]) / 2
    : voteCounts[mid];
}

// 辅助函数：检查评分和计数是否有效
function isValidRatingData(rating: string | number | undefined | null, count?: string | number | undefined | null): boolean {
  // 检查评分值
  if (!rating) return false;
  if (typeof rating === 'string') {
    if (rating === '暂无' || rating === 'tbd' || rating === 'N/A' || rating === '0') return false;
    const numRating = parseFloat(rating);
    if (isNaN(numRating) || numRating === 0) return false;
  } else if (typeof rating === 'number') {
    if (rating === 0 || isNaN(rating)) return false;
  }

  // 检查计数值（如果提供）
  if (count !== undefined) {
    if (!count) return false;
    if (typeof count === 'string') {
      if (count === '暂无' || count === '0' || count === 'N/A') return false;
      // 处理带K、M后缀的数字
      const numCount = count.includes('K') ? 
        parseFloat(count.replace('K', '')) * 1000 :
        count.includes('M') ? 
          parseFloat(count.replace('M', '')) * 1000000 :
          parseInt(count.replace(/[^0-9]/g, ''));
      if (isNaN(numCount) || numCount === 0) return false;
    } else if (typeof count === 'number') {
      if (count === 0 || isNaN(count)) return false;
    }
  }

  return true;
}

// 标准化评分函数
function normalizeRating(rating: string | number | null | undefined, platform: string, type?: string): number | null {
  if (!rating || rating === '暂无' || rating === 'tbd' || rating === 'N/A') return null;
  
  const numRating = typeof rating === 'string' ? 
    parseFloat(rating.replace('%', '').split('/')[0]) : rating;
    
  if (isNaN(numRating) || numRating === 0) return null;

  switch (platform) {
    case 'douban':
    case 'imdb':
    case 'tmdb':
    case 'trakt':
      return numRating;
    case 'letterboxd':
      return numRating * 2;
    case 'rottentomatoes':
      if (type === 'percentage') {
        return numRating / 10;
      }
      return type === 'audience_avg' ? numRating * 2 : numRating;
    case 'metacritic':
      return type === 'metascore' ? numRating / 10 : numRating;
    default:
      return null;
  }
}

export function calculateSeasonRating(ratings: SeasonRatingData, seasonNumber: number) {
  let ratingTimesVoteSum = 0;  // 评分乘以评分人数的总和
  let totalVoteCount = 0;      // 总评分人数
  const validPlatforms: string[] = [];  // 跟踪有效平台
  const ratingDetails: any[] = [];
  // 获取评分人数中位数(用于无评分人数的平台)
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
    validPlatforms.push('douban');
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
    let hasValidRt = false;
    // 专业评分
    if (isValidRatingData(rtSeason.critics_avg)) {
      const rating = normalizeRating(rtSeason.critics_avg, 'rottentomatoes') ?? 0;
      const criticsCount = rtSeason.critics_count 
        ? parseFloat(rtSeason.critics_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      hasValidRt = true;
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
      hasValidRt = true;
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
      hasValidRt = true;
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
      hasValidRt = true;
      ratingDetails.push({
        platform: 'rottentomatoes_audience_score',
        originalRating: rtSeason.audience_score,
        normalizedRating: rating,
        voteCount: audienceCount,
        contribution: rating * audienceCount
      });
    }
    if (hasValidRt) {
      validPlatforms.push('rottentomatoes');
    }
  }

  // Metacritic分季评分
  const mcSeason = ratings.metacritic?.seasons?.find(s => s.season_number === seasonNumber);
  if (mcSeason) {
    let hasValidMc = false;
    // 专业评分
    if (isValidRatingData(mcSeason.metascore)) {
      const rating = normalizeRating(mcSeason.metascore, 'metacritic', 'metascore') ?? 0;
      const criticsCount = mcSeason.critics_count
        ? parseFloat(mcSeason.critics_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
      hasValidMc = true;
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
      hasValidMc = true;
      ratingDetails.push({
        platform: 'metacritic_userscore',
        originalRating: mcSeason.userscore,
        normalizedRating: rating,
        voteCount: usersCount,
        contribution: rating * usersCount
      });
    }
    if (hasValidMc) {
      validPlatforms.push('metacritic');
    }
  }

  // TMDB分季评分
  const tmdbSeason = ratings.tmdb?.seasons?.find(s => s.season_number === seasonNumber);
  if (isValidRatingData(tmdbSeason?.rating)) {
    const rating = tmdbSeason?.rating || 0;
    const voteCount = tmdbSeason?.voteCount || medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
    validPlatforms.push('tmdb');
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
    validPlatforms.push('trakt');
    ratingDetails.push({
      platform: 'trakt',
      originalRating: traktSeason?.rating,
      normalizedRating: rating,
      voteCount: voteCount,
      contribution: rating * voteCount
    });
  }

  const finalRating = totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;

  // 添加详细的调试日志
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