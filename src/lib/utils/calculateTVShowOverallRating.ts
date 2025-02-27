import { TVShowRatingData } from '../../types/ratings';

// 辅助函数:计算评分人数的中位数
function calculateMedianVoteCount(ratingData: TVShowRatingData): number {
  const voteCounts = [];
  
  // 收集所有有效的评分人数
  if (ratingData.douban?.rating_people) {
    voteCounts.push(parseFloat(ratingData.douban.rating_people.replace(/[^0-9]/g, '')));
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
      return numRating / 10;
    default:
      return null;
  }
}

export function calculateTVShowOverallRating(ratingData: TVShowRatingData) {
  let ratingTimesVoteSum = 0;  // 评分乘以评分人数的总和
  let totalVoteCount = 0;      // 总评分人数
  
  // 获取评分人数中位数(用于无评分人数的平台)
  const medianVoteCount = calculateMedianVoteCount(ratingData);

  // IMDB评分
  if (isValidRatingData(ratingData.imdb?.rating)) {
    const rating = normalizeRating(ratingData.imdb?.rating, 'imdb') ?? 0;
    const voteCount = ratingData.imdb?.rating_people 
      ? parseFloat(ratingData.imdb.rating_people.replace(/[^0-9]/g, ''))
      : medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
  }

  // 烂番茄评分
  if (ratingData.rottentomatoes?.series) {
    const rt = ratingData.rottentomatoes.series;
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
  if (ratingData.metacritic?.overall) {
    const mc = ratingData.metacritic.overall;
    // 专业评分
    if (isValidRatingData(mc.metascore)) {
      const rating = normalizeRating(mc.metascore, 'metacritic') ?? 0;
      const criticsCount = mc.critics_count
        ? parseFloat(mc.critics_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * criticsCount;
      totalVoteCount += criticsCount;
    }
    // 用户评分
    if (isValidRatingData(mc.userscore)) {
      const rating = normalizeRating(mc.userscore, 'metacritic') ?? 0;
      const usersCount = mc.users_count
        ? parseFloat(mc.users_count)
        : medianVoteCount;
      ratingTimesVoteSum += rating * usersCount;
      totalVoteCount += usersCount;
    }
  }

  // TMDB评分
  if (isValidRatingData(ratingData.tmdb?.rating)) {
    const rating = normalizeRating(ratingData.tmdb?.rating, 'tmdb') ?? 0;
    const voteCount = ratingData.tmdb?.voteCount ?? medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
  }

  // Trakt评分
  if (isValidRatingData(ratingData.trakt?.rating)) {
    const rating = normalizeRating(ratingData.trakt?.rating, 'trakt') ?? 0;
    const voteCount = ratingData.trakt?.votes ?? medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
  }

  // Letterboxd评分
  if (isValidRatingData(ratingData.letterboxd?.rating)) {
    const rating = normalizeRating(ratingData.letterboxd?.rating, 'letterboxd') ?? 0;
    const voteCount = ratingData.letterboxd?.rating_count 
      ? parseFloat(ratingData.letterboxd.rating_count.replace(/[^0-9]/g, ''))
      : medianVoteCount;
    ratingTimesVoteSum += rating * voteCount;
    totalVoteCount += voteCount;
  }

  return totalVoteCount > 0 ? Number((ratingTimesVoteSum / totalVoteCount).toFixed(1)) : null;
} 
