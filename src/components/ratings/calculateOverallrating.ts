import type {
  RottenTomatoesRating,
  MetacriticRating,
  RatingData,
} from '../../types/ratings';

// 平台权重配置
const PLATFORM_WEIGHTS = {
  douban: 1.8,
  imdb: 1.7,
  letterboxd: 1.3,
  rottentomatoes: 1.4,
  metacritic: 1.5,
  tmdb: 0.7,
  trakt: 0.6
};

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
      return numRating * 2; // 5分制转10分制
    case 'rottentomatoes':
      if (type === 'percentage') {
        return numRating / 10; // 百分比转10分制
      }
      return type === 'audience_avg' ? numRating * 2 : numRating; // 观众5分制转10分制
    case 'metacritic':
      return numRating / 10; // 100分制转10分制
    default:
      return null;
  }
}

// 评分调整函数
function adjustScore(score: number): number {
  if (score >= 8.5) {
    return score * 1.02;
  } else if (score >= 6.5) {
    return score
  } else if (score >= 5.0) {
    return score * 0.98;
  } else {
    return score * 0.93;
  }
}

// 计算评分人数权重
function calculateVoteWeight(voteCount: string | number): number {
  let count: number;
  if (typeof voteCount === 'string') {
    // 处理带K、M后缀的数字
    if (voteCount.includes('K')) {
      count = parseFloat(voteCount.replace('K', '')) * 1000;
    } else if (voteCount.includes('M')) {
      count = parseFloat(voteCount.replace('M', '')) * 1000000;
    } else {
      count = parseInt(voteCount.replace(/[^0-9]/g, ''));
    }
  } else {
    count = voteCount;
  }
  
  if (isNaN(count)) return 0;

  // 使用对数函数计算权重，避免投票数量过大时权重过高
  const baseWeight = Math.log10(count + 1) / Math.log10(200000);
  return Math.min(baseWeight, 1.0);
}

export function isValidScore(score: any): boolean {
  if (!score || score === '暂无' || score === 'tbd' || score === 'N/A') return false;
  const numScore = parseFloat(score);
  return !isNaN(numScore) && numScore > 0;
}

interface CalculatedRating {
  rating: number | null;
  validRatings: number;
  platforms: string[];
}

interface RTRating extends RottenTomatoesRating {}

export function calculateOverallRating(ratingData: RatingData): CalculatedRating {
  if (!ratingData) return { rating: null, validRatings: 0, platforms: [] };

  let weightedSum = 0;
  let totalWeight = 0;
  const validPlatforms: string[] = [];
  
  // 处理豆瓣评分
  if (ratingData.douban?.rating) {
    const rating = ratingData.douban.rating;
    if (rating !== '暂无' && !isNaN(parseFloat(rating))) {
      const normalizedRating = parseFloat(rating);
      const voteWeight = calculateVoteWeight(ratingData.douban.rating_people);
      const weight = PLATFORM_WEIGHTS.douban * (1 + voteWeight);
      weightedSum += adjustScore(normalizedRating) * weight;
      totalWeight += weight;
      validPlatforms.push('douban');
    }
  }

  // 处理IMDb评分
  if (ratingData.imdb?.rating) {
    const rating = ratingData.imdb.rating;
    if (rating !== '暂无' && !isNaN(parseFloat(rating))) {
      const normalizedRating = parseFloat(rating);
      const voteWeight = calculateVoteWeight(ratingData.imdb.rating_people);
      const weight = PLATFORM_WEIGHTS.imdb * (1 + voteWeight);
      weightedSum += adjustScore(normalizedRating) * weight;
      totalWeight += weight;
      validPlatforms.push('imdb');
    }
  }

  // 处理Letterboxd评分
  if (ratingData.letterboxd?.rating) {
    const rating = ratingData.letterboxd.rating;
    if (rating !== '暂无' && !isNaN(parseFloat(rating))) {
      const normalizedRating = parseFloat(rating) * 2; // 5分制转10分制
      const voteWeight = calculateVoteWeight(ratingData.letterboxd.rating_count);
      const weight = PLATFORM_WEIGHTS.letterboxd * (1 + voteWeight);
      weightedSum += adjustScore(normalizedRating) * weight;
      totalWeight += weight;
      validPlatforms.push('letterboxd');
    }
  }

  // 处理Rotten Tomatoes评分
  if (ratingData.rottentomatoes) {
    const rt = ratingData.rottentomatoes as RTRating;
    const rtData = rt.series || rt;
    const weights = PLATFORM_WEIGHTS.rottentomatoes;

    let validRtScores = 0;
    let rtSum = 0;

    // 处理专业评分(tomatometer)
    if (rtData.tomatometer && rtData.tomatometer !== '暂无' && !isNaN(parseFloat(rtData.tomatometer))) {
      const tomatometer = parseFloat(rtData.tomatometer) / 10;
      rtSum += adjustScore(tomatometer);
      validRtScores++;
    }

    // 处理观众评分(audience_score)
    if (rtData.audience_score && rtData.audience_score !== '暂无' && !isNaN(parseFloat(rtData.audience_score))) {
      const audienceScore = parseFloat(rtData.audience_score) / 10;
      rtSum += adjustScore(audienceScore);
      validRtScores++;
    }

    // 处理专业平均分(critics_avg)
    if (rtData.critics_avg && rtData.critics_avg !== '暂无') {
      const match = rtData.critics_avg.match(/(\d+(\.\d+)?)/);
      if (match) {
        const criticsAvg = parseFloat(match[1]);
        rtSum += adjustScore(criticsAvg);
        validRtScores++;
      }
    }

    // 处理观众平均分(audience_avg)
    if (rtData.audience_avg && rtData.audience_avg !== '暂无') {
      const match = rtData.audience_avg.match(/(\d+(\.\d+)?)/);
      if (match) {
        const audienceAvg = parseFloat(match[1]) * 2; // 5分制转10分制
        rtSum += adjustScore(audienceAvg);
        validRtScores++;
      }
    }

    // 只有在有效评分时才计入总分
    if (validRtScores > 0) {
      const rtAverage = rtSum / validRtScores;
      weightedSum += rtAverage * weights;
      totalWeight += weights;
      validPlatforms.push('rottentomatoes');
    }
  }

  // 处理Metacritic评分
  if (ratingData.metacritic) {
    const mc = ('overall' in ratingData.metacritic) ? 
      (ratingData.metacritic as MetacriticRating).overall : 
      ratingData.metacritic;
    const weights = PLATFORM_WEIGHTS.metacritic;

    let validMcScores = 0;
    let mcSum = 0;

    // 处理专业评分(metascore)
    if (mc.metascore && mc.metascore !== '暂无' && mc.metascore !== 'tbd' && !isNaN(parseFloat(mc.metascore))) {
      const metascore = parseFloat(mc.metascore) / 10;
      mcSum += adjustScore(metascore);
      validMcScores++;
    }

    // 处理用户评分(userscore)
    if (mc.userscore && mc.userscore !== '暂无' && mc.userscore !== 'tbd' && !isNaN(parseFloat(mc.userscore))) {
      const userscore = parseFloat(mc.userscore);
      mcSum += adjustScore(userscore);
      validMcScores++;
    }

    // 只有在有效评分时才计入总分
    if (validMcScores > 0) {
      const mcAverage = mcSum / validMcScores;
      weightedSum += mcAverage * weights;
      totalWeight += weights;
      validPlatforms.push('metacritic');
    }
  }

  // 处理TMDB评分
  if (ratingData.tmdb?.rating) {
    const rating = String(ratingData.tmdb.rating);
    if (rating !== '暂无' && !isNaN(parseFloat(rating))) {
      const normalizedRating = parseFloat(rating);
      const voteWeight = calculateVoteWeight(ratingData.tmdb.voteCount);
      const weight = PLATFORM_WEIGHTS.tmdb * (1 + voteWeight);
      weightedSum += adjustScore(normalizedRating) * weight;
      totalWeight += weight;
      validPlatforms.push('tmdb');
    }
  }

  // 处理Trakt评分
  if (ratingData.trakt?.rating) {
    const rating = String(ratingData.trakt.rating);
    if (rating !== '暂无' && !isNaN(parseFloat(rating))) {
      const normalizedRating = parseFloat(rating);
      const voteWeight = calculateVoteWeight(ratingData.trakt.voteCount);
      const weight = PLATFORM_WEIGHTS.trakt * (1 + voteWeight);
      weightedSum += adjustScore(normalizedRating) * weight;
      totalWeight += weight;
      validPlatforms.push('trakt');
    }
  }

  // 计算最终评分
  const finalRating = totalWeight > 0 ? weightedSum / totalWeight : null;
  return { 
    rating: finalRating, 
    validRatings: validPlatforms.length, 
    platforms: validPlatforms 
  };
}
