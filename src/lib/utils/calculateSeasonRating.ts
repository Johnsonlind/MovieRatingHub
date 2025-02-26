// 平台权重配置
const PLATFORM_WEIGHTS = {
  douban: 1.8,
  imdb: 1.7,
  letterboxd: 1.3,
  rottentomatoes: {
    critics: 1.5,    // 专业评分权重
    audience: 1.3,   // 用户评分权重
    series: 1.4,     // 整体评分权重
    season: 1.2      // 分季评分权重
  },
  metacritic: {
    critics: 1.6,    // 专业评分权重
    users: 1.4,      // 用户评分权重
    series: 1.5,     // 整体评分权重
    season: 1.3      // 分季评分权重
  },
  tmdb: {
    series: 0.7,
    season: 0.6
  },
  trakt: {
    series: 0.6,
    season: 0.5
  },
  season_average: 1.5  // 季度平均分权重
};

export function calculateSeasonRating(ratings: {
  douban?: {
    rating: string;
    rating_people?: string;
  };
  rt?: {
    tomatometer?: string;
    tomatometer_count?: string;
    critics_avg?: string;
    audience_score?: string;
    audience_count?: string;
    audience_avg?: string;
  };
  metacritic?: {
    metascore?: string;
    critics_count?: string;
    userscore?: string;
    users_count?: string;
  };
  tmdb?: {
    rating: number;
    voteCount?: number;
  };
  trakt?: {
    rating: number;
    votes?: number;
  };
}) {
  let weightedSum = 0;
  let totalWeight = 0;

  // 豆瓣评分
  if (ratings.douban?.rating && ratings.douban.rating !== '暂无') {
    const rating = parseFloat(ratings.douban.rating);
    const voteWeight = calculateVoteWeight(ratings.douban.rating_people);
    const weight = PLATFORM_WEIGHTS.douban * (1 + voteWeight);
    weightedSum += rating * weight;
    totalWeight += weight;
  }

  // 烂番茄评分
  if (ratings.rt) {
    const rt = ratings.rt;
    const rtRatings: number[] = [];
    let rtSum = 0;
    let rtWeight = 0;

    // 专业评分
    if (rt.tomatometer && rt.tomatometer !== '暂无' && rt.tomatometer !== 'tbd') {
      const tomatometer = parseFloat(rt.tomatometer) / 10;
      const criticsVoteWeight = calculateVoteWeight(rt.tomatometer_count);
      rtRatings.push(tomatometer);
      rtSum += tomatometer * PLATFORM_WEIGHTS.rottentomatoes.critics * (1 + criticsVoteWeight);
      rtWeight += PLATFORM_WEIGHTS.rottentomatoes.critics * (1 + criticsVoteWeight);
    }

    // 用户评分
    if (rt.audience_score && rt.audience_score !== '暂无' && rt.audience_score !== 'tbd') {
      const audienceScore = parseFloat(rt.audience_score) / 10;
      const audienceVoteWeight = calculateVoteWeight(rt.audience_count);
      rtRatings.push(audienceScore);
      rtSum += audienceScore * PLATFORM_WEIGHTS.rottentomatoes.audience * (1 + audienceVoteWeight);
      rtWeight += PLATFORM_WEIGHTS.rottentomatoes.audience * (1 + audienceVoteWeight);
    }

    // 计算评分方差并调整权重
    const variance = calculateVariance(rtRatings);
    const varianceWeight = 1 / (1 + variance);

    if (rtWeight > 0) {
      weightedSum += (rtSum / rtWeight) * PLATFORM_WEIGHTS.rottentomatoes.season * varianceWeight;
      totalWeight += PLATFORM_WEIGHTS.rottentomatoes.season * varianceWeight;
    }
  }

  // Metacritic评分
  if (ratings.metacritic) {
    const mc = ratings.metacritic;
    const mcRatings: number[] = [];
    let mcSum = 0;
    let mcWeight = 0;

    // 专业评分
    if (mc.metascore && mc.metascore !== '暂无' && mc.metascore !== 'tbd') {
      const metascore = parseFloat(mc.metascore) / 10;
      const criticsVoteWeight = calculateVoteWeight(mc.critics_count);
      mcRatings.push(metascore);
      mcSum += metascore * PLATFORM_WEIGHTS.metacritic.critics * (1 + criticsVoteWeight);
      mcWeight += PLATFORM_WEIGHTS.metacritic.critics * (1 + criticsVoteWeight);
    }

    // 用户评分
    if (mc.userscore && mc.userscore !== '暂无' && mc.userscore !== 'tbd') {
      const userscore = parseFloat(mc.userscore);
      const userVoteWeight = calculateVoteWeight(mc.users_count);
      mcRatings.push(userscore);
      mcSum += userscore * PLATFORM_WEIGHTS.metacritic.users * (1 + userVoteWeight);
      mcWeight += PLATFORM_WEIGHTS.metacritic.users * (1 + userVoteWeight);
    }

    const variance = calculateVariance(mcRatings);
    const varianceWeight = 1 / (1 + variance);

    if (mcWeight > 0) {
      weightedSum += (mcSum / mcWeight) * PLATFORM_WEIGHTS.metacritic.season * varianceWeight;
      totalWeight += PLATFORM_WEIGHTS.metacritic.season * varianceWeight;
    }
  }

  // TMDB评分
  if (ratings.tmdb?.rating) {
    const voteWeight = calculateVoteWeight(ratings.tmdb.voteCount);
    const weight = PLATFORM_WEIGHTS.tmdb.season * (1 + voteWeight);
    weightedSum += ratings.tmdb.rating * weight;
    totalWeight += weight;
  }

  // Trakt评分
  if (ratings.trakt?.rating) {
    const voteWeight = calculateVoteWeight(ratings.trakt.votes);
    const weight = PLATFORM_WEIGHTS.trakt.season * (1 + voteWeight);
    weightedSum += ratings.trakt.rating * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function calculateVoteWeight(people: string | number | undefined): number {
  if (!people) return 0;
  
  // 如果是字符串类型，需要处理单位（K、M等）
  if (typeof people === 'string') {
    if (people.includes('K')) {
      return Math.min(parseFloat(people.replace('K', '')) * 1000 / 10000, 0.5);
    }
    if (people.includes('M')) {
      return Math.min(parseFloat(people.replace('M', '')) * 1000000 / 10000, 0.5);
    }
    return Math.min(parseInt(people.replace(/[^0-9]/g, '')) / 10000, 0.5);
  }
  
  // 如果是数字类型，直接计算
  return Math.min(people / 10000, 0.5);
}

function calculateVariance(ratings: number[]): number {
  if (ratings.length < 2) return 0;

  const mean = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length;
  return variance;
}