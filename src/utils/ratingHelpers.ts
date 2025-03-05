// ==========================================
// 评分辅助函数
// ==========================================
import type { DoubanSeasonRating, RottenTomatoesSeasonRating,MetacriticSeasonRating,TMDBSeasonRating,TraktSeasonRating } from '../types/ratings';
// 辅助函数：检查评分和计数是否有效
export function isValidRatingData(rating: string | number | undefined | null, count?: string | number | undefined | null): boolean {
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

/**
 * 评分归一化 - 将不同平台的评分转换为统一的10分制
 * @param rating 原始评分
 * @param platform 平台名称
 * @param type
 * @returns
 */
export function normalizeRating(
  rating: string | number | undefined,
  platform: string,
  type: string = 'default'
): number | null {
  if (!rating || rating === '暂无' || rating === 'tbd' || rating === '0') {
    return null;
  }

  // 将字符串转为数字
  const numericRating = typeof rating === 'string' ? parseFloat(rating) : rating;
  
  // 根据平台和类型进行归一化
  switch (platform) {
    case 'douban':
      return numericRating;
      
    case 'imdb':
      return numericRating;
      
    case 'rottentomatoes':
      if (type === 'percentage') {
        return numericRating / 10;
      } else if (type === 'audience_avg') {
        return numericRating * 2;
      } else {
        return numericRating;
      }
      
    case 'metacritic':
      if (type === 'metascore') {
        return numericRating / 10;
      } else if (type === 'userscore') {
        return numericRating;
      } else {
        return numericRating / 10;
      }
      
    case 'tmdb':
      return numericRating;
      
    case 'trakt':
      return numericRating;
      
    case 'letterboxd':
      if (type === 'percentage') {
        return numericRating / 10;
      } else {
        return numericRating * 2;
      }
      
    default:
      return numericRating;
  }
}

/**
 * 从评分数据中提取评分人数并计算中位数
 * @param ratingData
 * @param options
 * @returns
 */
export function calculateMedianVoteCount(
  ratingData: any, 
  options: { 
    includeSeasons?: boolean,
    checkOtherSeasons?: boolean
  } = {}
): number {
  const { includeSeasons = false, checkOtherSeasons = false } = options;
  const voteCounts: number[] = [];
  
  // 收集所有有效的评分人数
  // 1. 豆瓣
  if (ratingData.douban?.rating_people) {
    voteCounts.push(parseFloat(ratingData.douban.rating_people.replace(/[^0-9]/g, '')));
  }
  
  // 2. IMDB
  if (ratingData.imdb?.rating_people) {
    voteCounts.push(parseFloat(ratingData.imdb.rating_people.replace(/[^0-9]/g, '')));
  }
  
  // 3. 烂番茄 - 处理电影和电视剧不同的数据结构
  if (ratingData.rottentomatoes?.series?.critics_count) {
    voteCounts.push(parseFloat(ratingData.rottentomatoes.series.critics_count.replace(/[^0-9]/g, '')));
  } else if (ratingData.rottentomatoes?.critics_count) {
    voteCounts.push(parseFloat(ratingData.rottentomatoes.critics_count.replace(/[^0-9]/g, '')));
  }
  
  if (ratingData.rottentomatoes?.series?.audience_count) {
    voteCounts.push(parseFloat(ratingData.rottentomatoes.series.audience_count.replace(/[^0-9]/g, '')));
  } else if (ratingData.rottentomatoes?.audience_count) {
    // 处理 "10,000+ Ratings" 这样的格式
    const count = ratingData.rottentomatoes.audience_count.replace(/[^0-9]/g, '');
    voteCounts.push(parseFloat(count));
  }
  
  // 4. Metacritic - 处理电影和电视剧不同的数据结构
  if (ratingData.metacritic?.overall?.critics_count) {
    voteCounts.push(parseFloat(ratingData.metacritic.overall.critics_count));
  } else if (ratingData.metacritic?.critics_count) {
    voteCounts.push(parseFloat(ratingData.metacritic.critics_count));
  }
  
  if (ratingData.metacritic?.overall?.users_count) {
    voteCounts.push(parseFloat(ratingData.metacritic.overall.users_count));
  } else if (ratingData.metacritic?.users_count) {
    voteCounts.push(parseFloat(ratingData.metacritic.users_count));
  }
  
  // 5. TMDB
  if (ratingData.tmdb?.voteCount) {
    voteCounts.push(ratingData.tmdb.voteCount);
  }
  
  // 6. Trakt
  if (ratingData.trakt?.votes) {
    voteCounts.push(ratingData.trakt.votes);
  }
  
  // 7. Letterboxd
  if (ratingData.letterboxd?.rating_count) {
    voteCounts.push(parseFloat(ratingData.letterboxd.rating_count.replace(/[^0-9]/g, '')));
  }

  // 如果是电视剧,还要收集分季评分人数
  if (includeSeasons && ('type' in ratingData && ratingData.type === 'tv' || ratingData.seasons)) {
    const tvData = ratingData;
    tvData.seasons?.forEach((season: {
      douban?: Partial<DoubanSeasonRating>;
      rottentomatoes?: Partial<RottenTomatoesSeasonRating>;
      metacritic?: Partial<MetacriticSeasonRating>;
      tmdb?: Partial<TMDBSeasonRating>;
      trakt?: Partial<TraktSeasonRating>;
    }) => {
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

  // 如果没有任何有效评分人数且需要检查其他季度
  if (voteCounts.length === 0 && checkOtherSeasons) {
    // 从其他季度收集评分人数
    const allSeasonVoteCounts: number[] = [];
    
    // 收集豆瓣其他季度评分人数
    ratingData.douban?.seasons?.forEach((season: { rating_people: string }) => {
      if (season.rating_people) {
        allSeasonVoteCounts.push(parseFloat(season.rating_people.replace(/[^0-9]/g, '')));
      }
    });
    // 收集烂番茄其他季度评分人数
    ratingData.rottentomatoes?.seasons?.forEach((season: { critics_count?: string; audience_count?: string }) => {
      if (season.critics_count) {
        allSeasonVoteCounts.push(parseFloat(season.critics_count.replace(/[^0-9]/g, '')));
      }
      if (season.audience_count) {
        allSeasonVoteCounts.push(parseFloat(season.audience_count.replace(/[^0-9]/g, '')));
      }
    });

    // 收集Metacritic其他季度评分人数
    ratingData.metacritic?.seasons?.forEach((season: Partial<MetacriticSeasonRating>) => {
      if (season.critics_count) {
        allSeasonVoteCounts.push(parseFloat(season.critics_count));
      }
      if (season.users_count) {
        allSeasonVoteCounts.push(parseFloat(season.users_count));
      }
    });

    // 收集Trakt其他季度评分人数
    ratingData.trakt?.seasons?.forEach((season: Partial<TraktSeasonRating>) => {
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