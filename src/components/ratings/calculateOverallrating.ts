import type {
  RatingData,
  TVShowRatingData,
} from '../../types/ratings';

// 标准化评分函数
export function normalizeRating(rating: string | number | null | undefined, platform: string, type?: string): number | null {
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
      return numRating / 10;
    default:
      return null;
  }
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

// 辅助函数:计算评分人数的中位数
function calculateMedianVoteCount(ratingData: RatingData | TVShowRatingData): number {
  const voteCounts = [];
  
  // 收集所有有效的评分人数
  if (ratingData.douban?.rating_people) {
    voteCounts.push(parseFloat(ratingData.douban.rating_people.replace(/[^0-9]/g, '')));
  }
  if (ratingData.imdb?.rating_people) {
    voteCounts.push(parseFloat(ratingData.imdb.rating_people.replace(/[^0-9]/g, '')));
  }
  if (ratingData.rottentomatoes?.series?.critics_count) {
    voteCounts.push(parseFloat(ratingData.rottentomatoes.series.critics_count.replace(/[^0-9]/g, '')));
  }
  if (ratingData.rottentomatoes?.series?.audience_count) {
    voteCounts.push(parseFloat(ratingData.rottentomatoes.series.audience_count.replace(/[^0-9]/g, '')));
  }
  if (ratingData.metacritic?.overall?.critics_count) {
    voteCounts.push(parseFloat(ratingData.metacritic.overall.critics_count));
  }
  if (ratingData.metacritic?.overall?.users_count) {
    voteCounts.push(parseFloat(ratingData.metacritic.overall.users_count));
  }
  if (ratingData.tmdb?.voteCount) {
    voteCounts.push(ratingData.tmdb.voteCount);
  }
  if (ratingData.trakt?.votes) {
    voteCounts.push(ratingData.trakt.votes);
  }
  if (ratingData.letterboxd?.rating_count) {
    voteCounts.push(parseFloat(ratingData.letterboxd.rating_count.replace(/[^0-9]/g, '')));
  }

  // 如果是电视剧,还要收集分季评分人数
  if ('type' in ratingData && ratingData.type === 'tv') {
    const tvData = ratingData as TVShowRatingData;
    tvData.seasons?.forEach(season => {
      if (season.douban?.rating_people) {
        voteCounts.push(parseFloat(season.douban.rating_people.replace(/[^0-9]/g, '')));
      }
      if (season.rottentomatoes?.critics_count) {
        voteCounts.push(parseFloat(season.rottentomatoes.critics_count.replace(/[^0-9]/g, '')));
      }
      if (season.rottentomatoes?.audience_count) {
        voteCounts.push(parseFloat(season.rottentomatoes.audience_count.replace(/[^0-9]/g, '')));
      }
      if (season.metacritic?.critics_count) {
        voteCounts.push(parseFloat(season.metacritic.critics_count));
      }
      if (season.metacritic?.users_count) {
        voteCounts.push(parseFloat(season.metacritic.users_count));
      }
      if (season.tmdb?.voteCount) {
        voteCounts.push(season.tmdb.voteCount);
      }
      if (season.trakt?.votes) {
        voteCounts.push(season.trakt.votes);
      }
    });
  }

  // 如果没有任何有效评分人数,返回默认值
  if (voteCounts.length === 0) {
    return 1000;
  }
  
  // 计算中位数
  voteCounts.sort((a, b) => a - b);
  const mid = Math.floor(voteCounts.length / 2);
  return voteCounts.length % 2 === 0 
    ? (voteCounts[mid - 1] + voteCounts[mid]) / 2
    : voteCounts[mid];
}

export function calculateOverallRating(
  ratingData: RatingData | TVShowRatingData,
  type: 'movie' | 'tvshow' = 'movie'
): { rating: number | null; validRatings: number; platforms: string[] } {
  if (!ratingData) return { rating: null, validRatings: 0, platforms: [] };

  let ratingTimesVoteSum = 0;  // 评分乘以评分人数的总和
  let totalVoteCount = 0;      // 总评分人数
  const validPlatforms: string[] = [];
  
  // 获取评分人数中位数(用于无评分人数的平台)
  const medianVoteCount = calculateMedianVoteCount(ratingData);

  // 处理电影评分
  if (type === 'movie') {
    // 豆瓣评分
    if (isValidRatingData(ratingData.douban?.rating)) {
      const rating = parseFloat(ratingData.douban?.rating || '0');
      const voteCount = ratingData.douban?.rating_people 
        ? parseFloat(ratingData.douban.rating_people.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('douban');
    }

    // IMDB评分
    if (isValidRatingData(ratingData.imdb?.rating)) {
      const rating = parseFloat(ratingData.imdb?.rating || '0');
      const voteCount = ratingData.imdb?.rating_people
        ? parseFloat(ratingData.imdb.rating_people.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('imdb');
    }

    // 烂番茄评分
    if (ratingData.rottentomatoes?.series) {
      const rt = ratingData.rottentomatoes.series;
      // 专业评分
      if (isValidRatingData(rt.critics_avg)) {
        const rating = normalizeRating(rt.critics_avg, 'rottentomatoes') ?? 0;
        const voteCount = rt.critics_count
          ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      // 用户评分
      if (isValidRatingData(rt.audience_avg)) {
        const rating = normalizeRating(rt.audience_avg, 'rottentomatoes') ?? 0;
        const voteCount = rt.audience_count
          ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      if (rt.critics_avg || rt.audience_avg) {
        validPlatforms.push('rottentomatoes');
      }
    }

    // Metacritic评分
    if (ratingData.metacritic?.overall) {
      const mc = ratingData.metacritic.overall;
      // 专业评分
      if (isValidRatingData(mc.metascore)) {
        const rating = normalizeRating(mc.metascore, 'metacritic') ?? 0;
        const voteCount = mc.critics_count
          ? parseFloat(mc.critics_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      // 用户评分
      if (isValidRatingData(mc.userscore)) {
        const rating = normalizeRating(mc.userscore, 'metacritic') ?? 0;
        const voteCount = mc.users_count
          ? parseFloat(mc.users_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      if (mc.metascore || mc.userscore) {
        validPlatforms.push('metacritic');
      }
    }

    // TMDB评分
    if (isValidRatingData(ratingData.tmdb?.rating)) {
      const rating = ratingData.tmdb?.rating ?? 0;
      const voteCount = ratingData.tmdb?.voteCount ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('tmdb');
    }

    // Trakt评分
    if (isValidRatingData(ratingData.trakt?.rating)) {
      const rating = ratingData.trakt?.rating ?? 0;
      const voteCount = ratingData.trakt?.votes ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('trakt');
    }

    // Letterboxd评分
    if (isValidRatingData(ratingData.letterboxd?.rating)) {
      const rating = normalizeRating(ratingData.letterboxd?.rating, 'letterboxd') ?? 0;
      const voteCount = ratingData.letterboxd?.rating_count
        ? parseFloat(ratingData.letterboxd.rating_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('letterboxd');
    }
  } 
  // 处理剧集评分
  else {
    const tvData = ratingData as TVShowRatingData;
    
    // 处理整剧评分
    // IMDB评分
    if (isValidRatingData(tvData.imdb?.rating)) {
      const rating = parseFloat(tvData.imdb?.rating || '0');
      const voteCount = tvData.imdb?.rating_people
        ? parseFloat(tvData.imdb.rating_people.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('imdb');
    }

    // 烂番茄整剧评分
    if (tvData.rottentomatoes?.series) {
      const rt = tvData.rottentomatoes.series;
      if (isValidRatingData(rt.critics_avg)) {
        const rating = normalizeRating(rt.critics_avg, 'rottentomatoes') ?? 0;
        const voteCount = rt.critics_count
          ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      if (isValidRatingData(rt.audience_avg)) {
        const rating = normalizeRating(rt.audience_avg, 'rottentomatoes') ?? 0;
        const voteCount = rt.audience_count
          ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      if (rt.critics_avg || rt.audience_avg) {
        validPlatforms.push('rottentomatoes');
      }
    }

    // Metacritic整剧评分
    if (tvData.metacritic?.overall) {
      const mc = tvData.metacritic.overall;
      if (isValidRatingData(mc.metascore)) {
        const rating = normalizeRating(mc.metascore, 'metacritic') ?? 0;
        const voteCount = mc.critics_count
          ? parseFloat(mc.critics_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      if (isValidRatingData(mc.userscore)) {
        const rating = normalizeRating(mc.userscore, 'metacritic') ?? 0;
        const voteCount = mc.users_count
          ? parseFloat(mc.users_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
      }
      if (mc.metascore || mc.userscore) {
        validPlatforms.push('metacritic');
      }
    }

    // Letterboxd整剧评分
    if (isValidRatingData(tvData.letterboxd?.rating)) {
      const rating = normalizeRating(tvData.letterboxd?.rating, 'letterboxd') ?? 0;
      const voteCount = tvData.letterboxd?.rating_count
        ? parseFloat(tvData.letterboxd.rating_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('letterboxd');
    }

    // TMDB整剧评分
    if (isValidRatingData(tvData.tmdb?.rating)) {
      const rating = tvData.tmdb?.rating ?? 0;
      const voteCount = tvData.tmdb?.voteCount ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('tmdb');
    }

    // Trakt整剧评分
    if (isValidRatingData(tvData.trakt?.rating)) {
      const rating = tvData.trakt?.rating ?? 0;
      const voteCount = tvData.trakt?.votes ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('trakt');
    }

    // 处理分季评分
    if (tvData.seasons) {
      tvData.seasons.forEach(season => {
        // 豆瓣分季评分
        if (isValidRatingData(season.douban?.rating)) {
          const rating = parseFloat(season.douban?.rating || '0');
          const voteCount = season.douban?.rating_people
            ? parseFloat(season.douban.rating_people.replace(/[^0-9]/g, ''))
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('douban')) {
            validPlatforms.push('douban');
          }
        }

        // 烂番茄分季评分
        if (season.rottentomatoes) {
          const rt = season.rottentomatoes;
          if (isValidRatingData(rt.critics_avg)) {
            const rating = normalizeRating(rt.critics_avg, 'rottentomatoes') ?? 0;
            const voteCount = rt.critics_count
              ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
              : medianVoteCount;
            ratingTimesVoteSum += rating * voteCount;
            totalVoteCount += voteCount;
          }
          if (isValidRatingData(rt.audience_avg)) {
            const rating = normalizeRating(rt.audience_avg, 'rottentomatoes') ?? 0;
            const voteCount = rt.audience_count
              ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
              : medianVoteCount;
            ratingTimesVoteSum += rating * voteCount;
            totalVoteCount += voteCount;
          }
        }

        // Metacritic分季评分
        if (season.metacritic) {
          if (isValidRatingData(season.metacritic.metascore)) {
            const rating = normalizeRating(season.metacritic.metascore, 'metacritic') ?? 0;
            const voteCount = season.metacritic.critics_count
              ? parseFloat(season.metacritic.critics_count)
              : medianVoteCount;
            ratingTimesVoteSum += rating * voteCount;
            totalVoteCount += voteCount;
          }
          if (isValidRatingData(season.metacritic.userscore)) {
            const rating = normalizeRating(season.metacritic.userscore, 'metacritic') ?? 0;
            const voteCount = season.metacritic.users_count
              ? parseFloat(season.metacritic.users_count)
              : medianVoteCount;
            ratingTimesVoteSum += rating * voteCount;
            totalVoteCount += voteCount;
          }
        }

        // TMDB分季评分
        if (isValidRatingData(season.tmdb?.rating)) {
          const rating = season.tmdb?.rating ?? 0;
          const voteCount = season.tmdb?.voteCount ?? medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
        }

        // Trakt分季评分
        if (isValidRatingData(season.trakt?.rating)) {
          const rating = season.trakt?.rating ?? 0;
          const voteCount = season.trakt?.votes ?? medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
        }
      });
    }
  }

  const finalRating = totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;

  return {
    rating: finalRating,
    validRatings: validPlatforms.length,
    platforms: validPlatforms
  };
}
