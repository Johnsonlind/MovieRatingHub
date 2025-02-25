import { TVShowRatingData } from '../../types/ratings';

// 平台基础权重
const PLATFORM_WEIGHTS = {
  imdb: 1.7,
  letterboxd: 1.3,
  rottentomatoes: {
    critics: 1.5,  // 专业评分权重
    audience: 1.3, // 用户评分权重
    series: 1.4
  },
  metacritic: {
    critics: 1.6,  // 专业评分权重
    users: 1.4,    // 用户评分权重
    series: 1.5
  },
  tmdb: {
    series: 0.7
  },
  trakt: {
    series: 0.6
  }
};

// 辅助函数:计算投票权重
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
  return Math.min(Math.log10(count + 1) / Math.log10(200000), 1.0);
}

export function calculateTVShowOverallRating(ratingData: TVShowRatingData) {
  let weightedSum = 0;
  let totalWeight = 0;
  
  // 计算评分方差的函数
  const calculateVariance = (ratings: number[]) => {
    if (ratings.length < 2) return 0;
    const mean = ratings.reduce((a, b) => a + b) / ratings.length;
    const variance = ratings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / ratings.length;
    return variance;
  };

  // IMDB剧集评分
  if (ratingData.imdb?.rating && ratingData.imdb?.rating_people) {
    const voteWeight = calculateVoteWeight(ratingData.imdb.rating_people);
    const weight = PLATFORM_WEIGHTS.imdb * (1 + voteWeight);
    weightedSum += parseFloat(ratingData.imdb.rating) * weight;
    totalWeight += weight;
  }

  // 烂番茄剧集评分
  if (ratingData.rottentomatoes?.series) {
    const rt = ratingData.rottentomatoes.series;
    const ratings: number[] = [];
    let rtSum = 0;
    let rtWeight = 0;

    // 专业评分
    if (rt.tomatometer && rt.critics_count) {
      const tomatometer = parseFloat(rt.tomatometer) / 10;
      const voteWeight = calculateVoteWeight(rt.critics_count);
      ratings.push(tomatometer);
      rtSum += tomatometer * PLATFORM_WEIGHTS.rottentomatoes.critics * (1 + voteWeight);
      rtWeight += PLATFORM_WEIGHTS.rottentomatoes.critics * (1 + voteWeight);
    }

    // 用户评分
    if (rt.audience_score && rt.audience_count) {
      const audienceScore = parseFloat(rt.audience_score) / 10;
      const voteWeight = calculateVoteWeight(rt.audience_count);
      ratings.push(audienceScore);
      rtSum += audienceScore * PLATFORM_WEIGHTS.rottentomatoes.audience * (1 + voteWeight);
      rtWeight += PLATFORM_WEIGHTS.rottentomatoes.audience * (1 + voteWeight);
    }

    // 计算评分方差并调整权重
    const variance = calculateVariance(ratings);
    const varianceWeight = 1 / (1 + variance);

    if (rtWeight > 0) {
      weightedSum += (rtSum / rtWeight) * PLATFORM_WEIGHTS.rottentomatoes.series * varianceWeight;
      totalWeight += PLATFORM_WEIGHTS.rottentomatoes.series * varianceWeight;
    }
  }

  // Metacritic剧集评分
  if (ratingData.metacritic?.overall) {
    const mc = ratingData.metacritic.overall;
    const ratings: number[] = [];
    let mcSum = 0;
    let mcWeight = 0;

    if (mc.metascore && mc.critics_count) {
      const metascore = parseFloat(mc.metascore) / 10;
      const voteWeight = calculateVoteWeight(mc.critics_count);
      ratings.push(metascore);
      mcSum += metascore * PLATFORM_WEIGHTS.metacritic.critics * (1 + voteWeight);
      mcWeight += PLATFORM_WEIGHTS.metacritic.critics * (1 + voteWeight);
    }

    if (mc.userscore && mc.users_count) {
      const userscore = parseFloat(mc.userscore);
      const voteWeight = calculateVoteWeight(mc.users_count);
      ratings.push(userscore);
      mcSum += userscore * PLATFORM_WEIGHTS.metacritic.users * (1 + voteWeight);
      mcWeight += PLATFORM_WEIGHTS.metacritic.users * (1 + voteWeight);
    }

    const variance = calculateVariance(ratings);
    const varianceWeight = 1 / (1 + variance);

    if (mcWeight > 0) {
      weightedSum += (mcSum / mcWeight) * PLATFORM_WEIGHTS.metacritic.series * varianceWeight;
      totalWeight += PLATFORM_WEIGHTS.metacritic.series * varianceWeight;
    }
  }

  // TMDB剧集评分
  if (ratingData.tmdb?.rating && ratingData.tmdb?.voteCount) {
    const voteWeight = calculateVoteWeight(ratingData.tmdb.voteCount);
    const weight = PLATFORM_WEIGHTS.tmdb.series * (1 + voteWeight);
    weightedSum += ratingData.tmdb.rating * weight;
    totalWeight += weight;
  }

  // Trakt剧集评分
  if (ratingData.trakt?.rating && ratingData.trakt?.votes) {
    const voteWeight = calculateVoteWeight(ratingData.trakt.votes);
    const weight = PLATFORM_WEIGHTS.trakt.series * (1 + voteWeight);
    weightedSum += ratingData.trakt.rating * weight;
    totalWeight += weight;
  }

  // Letterboxd剧集评分
  if (ratingData.letterboxd?.rating && ratingData.letterboxd?.rating_count) {
    const voteWeight = calculateVoteWeight(ratingData.letterboxd.rating_count);
    const weight = PLATFORM_WEIGHTS.letterboxd * (1 + voteWeight);
    weightedSum += parseFloat(ratingData.letterboxd.rating) * 2 * weight; // 转换为10分制
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
} 