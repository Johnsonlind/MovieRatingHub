import type {
  RatingData,
  TVShowRatingData,
} from '../../types/ratings';

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
      return type === 'metascore' ? numRating / 10 : numRating;
    default:
      return null;
  }
}

export function calculateOverallRating(
  ratingData: RatingData | TVShowRatingData,
  type: 'movie' | 'tvshow' = 'movie'
): { rating: number | null; validRatings: number; platforms: string[] } {

  if (!ratingData) return { rating: null, validRatings: 0, platforms: [] };

  let ratingTimesVoteSum = 0;
  let totalVoteCount = 0;
  const validPlatforms: string[] = [];
  const ratingDetails: any[] = [];

  const medianVoteCount = calculateMedianVoteCount(ratingData);

  // 处理电影评分
  if (type === 'movie') {
    // 豆瓣电影评分
    if (isValidRatingData(ratingData.douban?.rating)) {
      const rating = parseFloat(ratingData.douban?.rating || '0');
      const voteCount = ratingData.douban?.rating_people 
        ? parseFloat(ratingData.douban.rating_people.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('douban');
      ratingDetails.push({
        platform: 'douban',
        originalRating: ratingData.douban?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // IMDB电影评分
    if (isValidRatingData(ratingData.imdb?.rating)) {
      const rating = parseFloat(ratingData.imdb?.rating || '0');
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

    // 烂番茄电影评分
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
        validPlatforms.push('rottentomatoes');
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.critics_avg || rt.tomatometer,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.tomatometer)) {
        const rating = normalizeRating(rt.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = rt.critics_count
          ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        validPlatforms.push('rottentomatoes');
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.tomatometer,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
      // 用户评分
      if (isValidRatingData(rt.audience_avg)) {
        const rating = normalizeRating(rt.audience_avg, 'rottentomatoes') ?? 0;
        const voteCount = rt.audience_count
          ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        validPlatforms.push('rottentomatoes');
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_avg || rt.audience_score,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.audience_score)) {
        const rating = normalizeRating(rt.audience_score, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = rt.audience_count
          ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        validPlatforms.push('rottentomatoes');
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_score,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
      if ((rt.critics_avg || rt.tomatometer || rt.audience_avg || rt.audience_score)) {
        validPlatforms.push('rottentomatoes');
      }
    }

    // Metacritic电影评分
    if (ratingData.metacritic?.overall) {
      const mc = ratingData.metacritic.overall;
      // 专业评分
      if (isValidRatingData(mc.metascore)) {
        const rating = normalizeRating(mc.metascore, 'metacritic', 'metascore') ?? 0;
        const voteCount = mc.critics_count
          ? parseFloat(mc.critics_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'metacritic_critics',
          originalRating: mc.metascore,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
      // 用户评分
      if (isValidRatingData(mc.userscore)) {
        const rating = normalizeRating(mc.userscore, 'metacritic', 'userscore') ?? 0;
        const voteCount = mc.users_count
          ? parseFloat(mc.users_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'metacritic_users',
          originalRating: mc.userscore,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
      if (mc.metascore || mc.userscore) {
        validPlatforms.push('metacritic');
      }
    }

    // TMDB电影评分
    if (isValidRatingData(ratingData.tmdb?.rating)) {
      const rating = ratingData.tmdb?.rating ?? 0;
      const voteCount = ratingData.tmdb?.voteCount ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('tmdb');
      ratingDetails.push({
        platform: 'tmdb',
        originalRating: ratingData.tmdb?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // Trakt电影评分
    if (isValidRatingData(ratingData.trakt?.rating)) {
      const rating = ratingData.trakt?.rating ?? 0;
      const voteCount = ratingData.trakt?.votes ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('trakt');
      ratingDetails.push({
        platform: 'trakt',
        originalRating: ratingData.trakt?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // Letterboxd电影评分
    if (isValidRatingData(ratingData.letterboxd?.rating)) {
      const rating = normalizeRating(ratingData.letterboxd?.rating, 'letterboxd') ?? 0;
      const voteCount = ratingData.letterboxd?.rating_count
        ? parseFloat(ratingData.letterboxd.rating_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('letterboxd');
      ratingDetails.push({
        platform: 'letterboxd',
        originalRating: ratingData.letterboxd?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }
  } 
  // 处理剧集评分
  else {
    const tvData = ratingData as TVShowRatingData;
    
    // 处理整剧评分
    // 豆瓣整剧评分
    if (isValidRatingData(tvData.douban?.rating)) {
      const rating = parseFloat(tvData.douban?.rating || '0');
      const voteCount = tvData.douban?.rating_people
        ? parseFloat(tvData.douban.rating_people.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('douban');
      ratingDetails.push({
        platform: 'douban',
        originalRating: tvData.douban?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // IMDB整剧评分
    if (isValidRatingData(tvData.imdb?.rating)) {
      const rating = parseFloat(tvData.imdb?.rating || '0');
      const voteCount = tvData.imdb?.rating_people
        ? parseFloat(tvData.imdb.rating_people.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('imdb');
      ratingDetails.push({
        platform: 'imdb',
        originalRating: tvData.imdb?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
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
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.critics_avg,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.tomatometer)) {
        const rating = normalizeRating(rt.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = rt.critics_count
          ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.tomatometer,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }

      if (isValidRatingData(rt.audience_avg)) {
        const rating = normalizeRating(rt.audience_avg, 'rottentomatoes') ?? 0;
        const voteCount = rt.audience_count
          ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_avg,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.audience_score)) {
        const rating = normalizeRating(rt.audience_score, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = rt.audience_count
          ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_score,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }

      if ((rt.critics_avg || rt.tomatometer || rt.audience_avg || rt.audience_score)) {
        validPlatforms.push('rottentomatoes');
      }
    }

    // Metacritic整剧评分
    if (tvData.metacritic?.overall) {
      const mc = tvData.metacritic.overall;
      if (isValidRatingData(mc.metascore)) {
        const rating = normalizeRating(mc.metascore, 'metacritic', 'metascore') ?? 0;
        const voteCount = mc.critics_count
          ? parseFloat(mc.critics_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'metacritic_critics',
          originalRating: mc.metascore,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
      if (isValidRatingData(mc.userscore)) {
        const rating = normalizeRating(mc.userscore, 'metacritic', 'userscore') ?? 0;
        const voteCount = mc.users_count
          ? parseFloat(mc.users_count)
          : medianVoteCount;
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        ratingDetails.push({
          platform: 'metacritic_users',
          originalRating: mc.userscore,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
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
      ratingDetails.push({
        platform: 'letterboxd',
        originalRating: tvData.letterboxd?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // TMDB整剧评分
    if (isValidRatingData(tvData.tmdb?.rating)) {
      const rating = tvData.tmdb?.rating ?? 0;
      const voteCount = tvData.tmdb?.voteCount ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('tmdb');
      ratingDetails.push({
        platform: 'tmdb',
        originalRating: tvData.tmdb?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // Trakt整剧评分
    if (isValidRatingData(tvData.trakt?.rating)) {
      const rating = tvData.trakt?.rating ?? 0;
      const voteCount = tvData.trakt?.votes ?? medianVoteCount;
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      validPlatforms.push('trakt');
      ratingDetails.push({
        platform: 'trakt',
        originalRating: tvData.trakt?.rating,
        normalizedRating: rating,
        voteCount,
        contribution: rating * voteCount
      });
    }

    // 处理分季评分
    // 豆瓣分季评分
    if (tvData.douban?.seasons) {
      tvData.douban.seasons.forEach(season => {
        if (isValidRatingData(season.rating)) {
          const rating = parseFloat(season.rating || '0');
          const voteCount = season.rating_people
            ? parseFloat(season.rating_people.replace(/[^0-9]/g, ''))
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('douban')) {
            validPlatforms.push('douban');
          }
          ratingDetails.push({
            platform: 'douban',
            season: season.season_number,
            originalRating: season.rating,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }
      });
    }

    // 烂番茄分季评分
    if (tvData.rottentomatoes?.seasons) {
      tvData.rottentomatoes.seasons.forEach(season => {
        if (isValidRatingData(season.critics_avg)) {
          const rating = normalizeRating(season.critics_avg, 'rottentomatoes') ?? 0;
          const voteCount = season.critics_count
            ? parseFloat(season.critics_count.replace(/[^0-9]/g, ''))
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          ratingDetails.push({
            platform: 'rottentomatoes_critics',
            season: season.season_number,
            originalRating: season.critics_avg,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        } else if (isValidRatingData(season.tomatometer)) {
          const rating = normalizeRating(season.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
          const voteCount = season.critics_count
            ? parseFloat(season.critics_count.replace(/[^0-9]/g, ''))
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          ratingDetails.push({
            platform: 'rottentomatoes_critics',
            season: season.season_number,
            originalRating: season.tomatometer,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }

        if (isValidRatingData(season.audience_avg)) {
          const rating = normalizeRating(season.audience_avg, 'rottentomatoes') ?? 0;
          const voteCount = season.audience_count
            ? parseFloat(season.audience_count.replace(/[^0-9]/g, ''))
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          ratingDetails.push({
            platform: 'rottentomatoes_audience',
            season: season.season_number,
            originalRating: season.audience_avg,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        } else if (isValidRatingData(season.audience_score)) {
          const rating = normalizeRating(season.audience_score, 'rottentomatoes', 'percentage') ?? 0;
          const voteCount = season.audience_count
            ? parseFloat(season.audience_count.replace(/[^0-9]/g, ''))
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          ratingDetails.push({
            platform: 'rottentomatoes_audience',
            season: season.season_number,
            originalRating: season.audience_score,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }

        if ((season.critics_avg || season.tomatometer || 
             season.audience_avg || season.audience_score) && 
            !validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
      });
    }

    // Metacritic分季评分
    if (tvData.metacritic?.seasons) {
      tvData.metacritic.seasons.forEach(season => {
        if (isValidRatingData(season.metascore)) {
          const rating = normalizeRating(season.metascore, 'metacritic', 'metascore') ?? 0;
          const voteCount = season.critics_count
            ? parseFloat(season.critics_count)
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          ratingDetails.push({
            platform: 'metacritic_critics',
            season: season.season_number,
            originalRating: season.metascore,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }
        if (isValidRatingData(season.userscore)) {
          const rating = normalizeRating(season.userscore, 'metacritic', 'userscore') ?? 0;
          const voteCount = season.users_count
            ? parseFloat(season.users_count)
            : medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          ratingDetails.push({
            platform: 'metacritic_users',
            season: season.season_number,
            originalRating: season.userscore,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }
        if ((season.metascore || season.userscore) && !validPlatforms.includes('metacritic')) {
          validPlatforms.push('metacritic');
        }
      });
    }

    // TMDB分季评分
    if (tvData.tmdb?.seasons) {
      tvData.tmdb.seasons.forEach(season => {
        if (isValidRatingData(season.rating)) {
          const rating = season.rating;
          const voteCount = season.voteCount ?? medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('tmdb')) {
            validPlatforms.push('tmdb');
          }
          ratingDetails.push({
            platform: 'tmdb',
            season: season.season_number,
            originalRating: season.rating,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }
      });
    }

    // Trakt分季评分
    if (tvData.trakt?.seasons) {
      tvData.trakt.seasons.forEach(season => {
        if (isValidRatingData(season.rating)) {
          const rating = season.rating;
          const voteCount = season.votes ?? medianVoteCount;
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('trakt')) {
            validPlatforms.push('trakt');
          }
          ratingDetails.push({
            platform: 'trakt',
            season: season.season_number,
            originalRating: season.rating,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }
      });
    }
  }

  const finalRating = totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;

  // 添加详细的调试日志
  console.log('综合评分计算详情:', {
    类型: type,
    中位数评分人数: medianVoteCount,
    各平台评分详情: ratingDetails,
    评分总和: ratingTimesVoteSum,
    总评分人数: totalVoteCount,
    有效平台数: validPlatforms.length,
    参与计算的平台: validPlatforms,
    最终评分: finalRating,
    原始评分数据: type === 'movie' ? {
      // 电影评分数据
      douban: ratingData.douban,
      imdb: ratingData.imdb,
      rottenTomatoes: ratingData.rottentomatoes?.series,
      metacritic: ratingData.metacritic?.overall,
      tmdb: ratingData.tmdb,
      trakt: ratingData.trakt,
      letterboxd: ratingData.letterboxd
    } : {
      // 剧集评分数据
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

  return {
    rating: finalRating,
    validRatings: validPlatforms.length,
    platforms: validPlatforms
  };
}