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
  rt?: {
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
  if (ratings.rt?.critics_count) {
    voteCounts.push(parseFloat(ratings.rt.critics_count.replace(/[^0-9]/g, '')));
  }
  if (ratings.rt?.audience_count) {
    // 处理 "10,000+ Ratings" 这样的格式
    const count = ratings.rt.audience_count.replace(/[^0-9]/g, '');
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
    ratings.rt?.seasons?.forEach(season => {
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
      return numRating / 10;
    default:
      return null;
  }
}

export function calculateSeasonRating(ratings: SeasonRatingData) {
  let ratingTimesVoteSum = 0;  // 评分乘以评分人数的总和
  let totalVoteCount = 0;      // 总评分人数
  
  // 获取评分人数中位数(用于无评分人数的平台)
  const medianVoteCount = calculateMedianVoteCount(ratings);

  // 豆瓣评分
  if (isValidRatingData(ratings.douban?.rating)) {
    const rating = normalizeRating(ratings.douban?.rating, 'douban') ?? 0;
    const rating_people = ratings.douban?.rating_people 
      ? parseFloat(ratings.douban.rating_people.replace(/[^0-9]/g, ''))
      : medianVoteCount;
    ratingTimesVoteSum += rating * rating_people;
    totalVoteCount += rating_people;
  }

  // 烂番茄评分
  if (ratings.rt) {
    const rt = ratings.rt;
    // 专业评分
    if (isValidRatingData(rt.critics_avg)) {
      const rating = normalizeRating(rt.critics_avg, 'rottentomatoes') ?? 0;
      const criticsCount = rt.critics_count 
        ? parseFloat(rt.critics_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
    }
    
    // 用户评分
    if (isValidRatingData(rt.audience_avg)) {
      const rating = normalizeRating(rt.audience_avg, 'rottentomatoes', 'audience_avg') ?? 0;
      const audienceCount = rt.audience_count
        ? parseFloat(rt.audience_count.replace(/[^0-9]/g, ''))
        : medianVoteCount;
      ratingTimesVoteSum += rating * audienceCount;
      totalVoteCount += audienceCount;
    }
  }

  // Metacritic评分
  if (ratings.metacritic) {
    // 专业评分
    if (isValidRatingData(ratings.metacritic.metascore)) {
      const rating = normalizeRating(ratings.metacritic.metascore, 'metacritic') ?? 0;
      const criticsCount = ratings.metacritic.critics_count
        ? parseFloat(ratings.metacritic.critics_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
    }

    // 用户评分
    if (isValidRatingData(ratings.metacritic.userscore)) {
      const rating = normalizeRating(ratings.metacritic.userscore, 'metacritic') ?? 0;
      const usersCount = ratings.metacritic.users_count
        ? parseFloat(ratings.metacritic.users_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * usersCount;
      totalVoteCount += usersCount;
    }
  }

  // TMDB评分
  if (ratings.tmdb?.rating !== undefined) {
    const rating = ratings.tmdb.rating || 0;
    const voteCount = ratings.tmdb.voteCount || medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
  }

  // Trakt评分
  if (ratings.trakt?.rating !== undefined) {
    const rating = ratings.trakt.rating || 0;
    const voteCount = ratings.trakt.votes || medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
  }

  return totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;
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
