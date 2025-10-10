// ==========================================
// 计算综合评分
// ==========================================
import type {RatingData, TVShowRatingData } from '../../types/ratings';
import { isValidRatingData, calculateMedianVoteCount, normalizeRating } from '../../utils/ratingHelpers';

// 安全解析计数：若为空、非数字或小于等于0，则回退到中位数
function safeParseCount(value: string | number | undefined | null, median: number): number {
  if (value === undefined || value === null) return median;
  if (typeof value === 'number') {
    return isNaN(value) || value <= 0 ? median : value;
  }
  const str = String(value).trim();
  if (!str || str === '暂无' || str === 'tbd' || str === 'N/A') return median;
  const digits = str.replace(/[^0-9.]/g, '');
  if (!digits) return median;
  const num = parseFloat(digits);
  return isNaN(num) || num <= 0 ? median : num;
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
      const voteCount = safeParseCount(ratingData.douban?.rating_people as any, medianVoteCount);
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

    // IMDB电影评分
    if (isValidRatingData(ratingData.imdb?.rating)) {
      const rating = parseFloat(ratingData.imdb?.rating || '0');
      const voteCount = safeParseCount(ratingData.imdb?.rating_people as any, medianVoteCount);
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      if (!validPlatforms.includes('imdb')) {
        validPlatforms.push('imdb');
      }
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
        const voteCount = safeParseCount(rt.critics_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.critics_avg || rt.tomatometer,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.tomatometer)) {
        const rating = normalizeRating(rt.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = safeParseCount(rt.critics_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
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
        const rating = normalizeRating(rt.audience_avg, 'rottentomatoes', 'audience_avg') ?? 0;
        const voteCount = safeParseCount(rt.audience_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_avg || rt.audience_score,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.audience_score)) {
        const rating = normalizeRating(rt.audience_score, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = safeParseCount(rt.audience_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_score,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
    }

    // Metacritic电影评分
    if (ratingData.metacritic?.overall) {
      const mc = ratingData.metacritic.overall;
      // 专业评分
      if (isValidRatingData(mc.metascore)) {
        const rating = normalizeRating(mc.metascore, 'metacritic', 'metascore') ?? 0;
        const voteCount = safeParseCount(mc.critics_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('metacritic')) {
          validPlatforms.push('metacritic');
        }
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
        const voteCount = safeParseCount(mc.users_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('metacritic')) {
          validPlatforms.push('metacritic');
        }
        ratingDetails.push({
          platform: 'metacritic_users',
          originalRating: mc.userscore,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
    }

    // TMDB电影评分
    if (isValidRatingData(ratingData.tmdb?.rating)) {
      const rating = ratingData.tmdb?.rating ?? 0;
      const voteCount = safeParseCount(ratingData.tmdb?.voteCount as any, medianVoteCount);
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

    // Trakt电影评分
    if (isValidRatingData(ratingData.trakt?.rating)) {
      const rating = ratingData.trakt?.rating ?? 0;
      const voteCount = safeParseCount(ratingData.trakt?.votes as any, medianVoteCount);
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

    // Letterboxd电影评分
    if (isValidRatingData(ratingData.letterboxd?.rating)) {
      const rating = normalizeRating(ratingData.letterboxd?.rating, 'letterboxd') ?? 0;
      const voteCount = safeParseCount(ratingData.letterboxd?.rating_count as any, medianVoteCount);
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
  } 
  // 处理剧集评分
  else {
    const tvData = ratingData as TVShowRatingData;
    
    // 处理整剧评分
    // 豆瓣整剧评分
    if (isValidRatingData(tvData.douban?.rating)) {
      const rating = parseFloat(tvData.douban?.rating || '0');
      const voteCount = safeParseCount(tvData.douban?.rating_people as any, medianVoteCount);
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      if (!validPlatforms.includes('douban')) {
        validPlatforms.push('douban');
      }
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
      const voteCount = safeParseCount(tvData.imdb?.rating_people as any, medianVoteCount);
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      if (!validPlatforms.includes('imdb')) {
        validPlatforms.push('imdb');
      }
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
        const voteCount = safeParseCount(rt.critics_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.critics_avg,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.tomatometer)) {
        const rating = normalizeRating(rt.tomatometer, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = safeParseCount(rt.critics_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_critics',
          originalRating: rt.tomatometer,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }

      if (isValidRatingData(rt.audience_avg)) {
        const rating = normalizeRating(rt.audience_avg, 'rottentomatoes', 'audience_avg') ?? 0;
        const voteCount = safeParseCount(rt.audience_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_avg,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      } else if (isValidRatingData(rt.audience_score)) {
        const rating = normalizeRating(rt.audience_score, 'rottentomatoes', 'percentage') ?? 0;
        const voteCount = safeParseCount(rt.audience_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('rottentomatoes')) {
          validPlatforms.push('rottentomatoes');
        }
        ratingDetails.push({
          platform: 'rottentomatoes_audience',
          originalRating: rt.audience_score,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
    }

    // Metacritic整剧评分
    if (tvData.metacritic?.overall) {
      const mc = tvData.metacritic.overall;
      if (isValidRatingData(mc.metascore)) {
        const rating = normalizeRating(mc.metascore, 'metacritic', 'metascore') ?? 0;
        const voteCount = safeParseCount(mc.critics_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('metacritic')) {
          validPlatforms.push('metacritic');
        }
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
        const voteCount = safeParseCount(mc.users_count as any, medianVoteCount);
        ratingTimesVoteSum += rating * voteCount;
        totalVoteCount += voteCount;
        if (!validPlatforms.includes('metacritic')) {
          validPlatforms.push('metacritic');
        }
        ratingDetails.push({
          platform: 'metacritic_users',
          originalRating: mc.userscore,
          normalizedRating: rating,
          voteCount,
          contribution: rating * voteCount
        });
      }
    }

    // Letterboxd整剧评分
    if (isValidRatingData(tvData.letterboxd?.rating)) {
      const rating = normalizeRating(tvData.letterboxd?.rating, 'letterboxd') ?? 0;
      const voteCount = safeParseCount(tvData.letterboxd?.rating_count as any, medianVoteCount);
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      if (!validPlatforms.includes('letterboxd')) {
        validPlatforms.push('letterboxd');
      }
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
      const voteCount = safeParseCount(tvData.tmdb?.voteCount as any, medianVoteCount);
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      if (!validPlatforms.includes('tmdb')) {
        validPlatforms.push('tmdb');
      }
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
      const voteCount = safeParseCount(tvData.trakt?.votes as any, medianVoteCount);
      ratingTimesVoteSum += rating * voteCount;
      totalVoteCount += voteCount;
      if (!validPlatforms.includes('trakt')) {
        validPlatforms.push('trakt');
      }
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
          const voteCount = safeParseCount(season.rating_people as any, medianVoteCount);
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
          const voteCount = safeParseCount(season.critics_count as any, medianVoteCount);
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('rottentomatoes')) {
            validPlatforms.push('rottentomatoes');
          }
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
          const voteCount = safeParseCount(season.critics_count as any, medianVoteCount);
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('rottentomatoes')) {
            validPlatforms.push('rottentomatoes');
          }
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
          const rating = normalizeRating(season.audience_avg, 'rottentomatoes', 'audience_avg') ?? 0;
          const voteCount = safeParseCount(season.audience_count as any, medianVoteCount);
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('rottentomatoes')) {
            validPlatforms.push('rottentomatoes');
          }
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
          const voteCount = safeParseCount(season.audience_count as any, medianVoteCount);
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('rottentomatoes')) {
            validPlatforms.push('rottentomatoes');
          }
          ratingDetails.push({
            platform: 'rottentomatoes_audience',
            season: season.season_number,
            originalRating: season.audience_score,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
        }
      });
    }

    // Metacritic分季评分
    if (tvData.metacritic?.seasons) {
      tvData.metacritic.seasons.forEach(season => {
        if (isValidRatingData(season.metascore)) {
          const rating = normalizeRating(season.metascore, 'metacritic', 'metascore') ?? 0;
          const voteCount = safeParseCount(season.critics_count as any, medianVoteCount);
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('metacritic')) {
            validPlatforms.push('metacritic');
          }
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
          const voteCount = safeParseCount(season.users_count as any, medianVoteCount);
          ratingTimesVoteSum += rating * voteCount;
          totalVoteCount += voteCount;
          if (!validPlatforms.includes('metacritic')) {
            validPlatforms.push('metacritic');
          }
          ratingDetails.push({
            platform: 'metacritic_users',
            season: season.season_number,
            originalRating: season.userscore,
            normalizedRating: rating,
            voteCount,
            contribution: rating * voteCount
          });
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

  // 调试日志
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
