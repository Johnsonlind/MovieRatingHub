import type {
  RatingData,
  TVShowRatingData,
} from '../../types/ratings';

// 平台权重配置
const PLATFORM_WEIGHTS = {
  douban: 1.2,
  imdb: 1.2,
  letterboxd: 1.0,
  rottentomatoes: {
    critics: 1.2,
    audience: 1.0,
    series: 1.1,
    season: 1.0
  },
  metacritic: {
    critics: 1.2,
    users: 1.0,
    series: 1.1,
    season: 1.0
  },
  tmdb: {
    series: 0.6,
    season: 0.5
  },
  trakt: {
    series: 0.5,
    season: 0.4
  }
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

// 评分调整函数
function adjustScore(score: number): number {
  if (score >= 8.5) {
    return score;
  } else if (score >= 6.5) {
    return score * 0.98;
  } else if (score >= 5.0) {
    return score * 0.95;
  } else {
    return score * 0.90;
  }
}

// 计算评分人数权重
function calculateVoteWeight(voteCount: string | number): number {
  let count: number;
  if (typeof voteCount === 'string') {
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

export function calculateOverallRating(
  ratingData: RatingData, 
  type: 'movie' | 'tvshow' = 'movie'
): CalculatedRating {

  if (!ratingData) return { rating: null, validRatings: 0, platforms: [] };

  let weightedSum = 0;
  let totalWeight = 0;
  const validPlatforms: string[] = [];
  const ratingDetails: {platform: string, rating: number, weight: number}[] = [];
  
  const calculateVariance = (ratings: number[]) => {
    if (ratings.length < 2) return 0;
    const mean = ratings.reduce((a, b) => a + b) / ratings.length;
    const variance = ratings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / ratings.length;
    return variance;
  };

  const addContribution = (score: number, weight: number, platform: string) => {
    if (score > 0 && weight > 0) {
      weightedSum += score * weight;
      totalWeight += weight;
      if (!validPlatforms.includes(platform)) {
        validPlatforms.push(platform);
      }
      ratingDetails.push({
        platform,
        rating: score,
        weight
      });
    }
  };

  if (type === 'movie') {
    // 豆瓣评分
    if (ratingData.douban?.rating) {
      const rating = ratingData.douban.rating;
      if (isValidScore(rating)) {
        const normalizedRating = parseFloat(rating);
        const voteWeight = calculateVoteWeight(ratingData.douban.rating_people);
        const weight = PLATFORM_WEIGHTS.douban * (1 + voteWeight);
        addContribution(adjustScore(normalizedRating), weight, 'douban');
      }
    }

    // IMDB评分
    if (ratingData.imdb?.rating) {
      const rating = ratingData.imdb.rating;
      if (isValidScore(rating)) {
        const normalizedRating = parseFloat(rating);
        const voteWeight = calculateVoteWeight(ratingData.imdb.rating_people);
        const weight = PLATFORM_WEIGHTS.imdb * (1 + voteWeight);
        addContribution(adjustScore(normalizedRating), weight, 'imdb');
      }
    }

    // 烂番茄评分
    if (ratingData.rottentomatoes?.series) {
      const rt = ratingData.rottentomatoes.series;
      const ratings: number[] = [];
      let rtSum = 0;
      let rtWeight = 0;

      if (rt.tomatometer && isValidScore(rt.tomatometer)) {
        const tomatometer = parseFloat(rt.tomatometer) / 10;
        ratings.push(tomatometer);
        rtSum += tomatometer * PLATFORM_WEIGHTS.rottentomatoes.critics;
        rtWeight += PLATFORM_WEIGHTS.rottentomatoes.critics;
      }

      if (rt.critics_avg && isValidScore(rt.critics_avg)) {
        const criticsAvg = parseFloat(rt.critics_avg);
        ratings.push(criticsAvg);
        rtSum += criticsAvg * PLATFORM_WEIGHTS.rottentomatoes.critics;
        rtWeight += PLATFORM_WEIGHTS.rottentomatoes.critics;
      }

      if (rt.audience_score && isValidScore(rt.audience_score)) {
        const audienceScore = parseFloat(rt.audience_score) / 10;
        ratings.push(audienceScore);
        rtSum += audienceScore * PLATFORM_WEIGHTS.rottentomatoes.audience;
        rtWeight += PLATFORM_WEIGHTS.rottentomatoes.audience;
      }

      if (rt.audience_avg && isValidScore(rt.audience_avg)) {
        const audienceAvg = parseFloat(rt.audience_avg) * 2;
        ratings.push(audienceAvg);
        rtSum += audienceAvg * PLATFORM_WEIGHTS.rottentomatoes.audience;
        rtWeight += PLATFORM_WEIGHTS.rottentomatoes.audience;
      }

      if (rtWeight > 0) {
        const variance = calculateVariance(ratings);
        const varianceWeight = 1 / (1 + variance);
        const rtAverage = rtSum / rtWeight;
        addContribution(rtAverage, PLATFORM_WEIGHTS.rottentomatoes.series * varianceWeight, 'rottentomatoes');
      }
    }

    // Metacritic评分
    if (ratingData.metacritic?.overall) {
      const mc = ratingData.metacritic.overall;
      const ratings: number[] = [];
      let mcSum = 0;
      let mcWeight = 0;

      if (mc.metascore && isValidScore(mc.metascore)) {
        const metascore = parseFloat(mc.metascore) / 10;
        ratings.push(metascore);
        mcSum += metascore * PLATFORM_WEIGHTS.metacritic.critics;
        mcWeight += PLATFORM_WEIGHTS.metacritic.critics;
      }

      if (mc.userscore && isValidScore(mc.userscore)) {
        const userscore = parseFloat(mc.userscore);
        ratings.push(userscore);
        mcSum += userscore * PLATFORM_WEIGHTS.metacritic.users;
        mcWeight += PLATFORM_WEIGHTS.metacritic.users;
      }

      if (mcWeight > 0) {
        const variance = calculateVariance(ratings);
        const varianceWeight = 1 / (1 + variance);
        const mcAverage = mcSum / mcWeight;
        addContribution(mcAverage, PLATFORM_WEIGHTS.metacritic.series * varianceWeight, 'metacritic');
      }
    }

    // TMDB评分
    if (ratingData.tmdb?.rating) {
      const rating = ratingData.tmdb.rating;
      if (rating > 0) {
        const voteWeight = calculateVoteWeight(ratingData.tmdb.voteCount);
        const weight = PLATFORM_WEIGHTS.tmdb.series * (1 + voteWeight);
        addContribution(adjustScore(rating), weight, 'tmdb');
      }
    }

    // Trakt评分
    if (ratingData.trakt?.rating) {
      const rating = ratingData.trakt.rating;
      if (rating > 0) {
        const voteWeight = calculateVoteWeight(ratingData.trakt.votes);
        const weight = PLATFORM_WEIGHTS.trakt.series * (1 + voteWeight);
        addContribution(adjustScore(rating), weight, 'trakt');
      }
    }

    // Letterboxd评分
    if (ratingData.letterboxd?.rating) {
      const rating = ratingData.letterboxd.rating;
      if (isValidScore(rating)) {
        const normalizedRating = parseFloat(rating) * 2;
        const voteWeight = calculateVoteWeight(ratingData.letterboxd.rating_count);
        const weight = PLATFORM_WEIGHTS.letterboxd * (1 + voteWeight);
        addContribution(adjustScore(normalizedRating), weight, 'letterboxd');
      }
    }

  } else {
    // 剧集评分处理
    const tvShowData = ratingData as TVShowRatingData;

    // 豆瓣（分季数据）
    if (tvShowData.douban?.seasons?.length) {
      let seasonTotal = 0;
      let validSeasons = 0;

      tvShowData.douban.seasons.forEach(season => {
        if (season.rating && season.rating !== '暂无') {
          const rating = parseFloat(season.rating);
          const voteWeight = calculateVoteWeight(season.rating_people);
          const adjScore = adjustScore(rating);
          
          seasonTotal += adjScore * (1 + voteWeight);
          validSeasons++;
        }
      });

      if (validSeasons > 0) {
        const avgScore = seasonTotal / validSeasons;
        const weight = PLATFORM_WEIGHTS.douban * 0.4 * validSeasons;
        addContribution(avgScore, weight, 'douban');
      }
    }

    // IMDB（只有整体数据）
    if (ratingData.imdb?.rating) {
      const rating = parseFloat(ratingData.imdb.rating);
      const voteWeight = calculateVoteWeight(ratingData.imdb.rating_people);
      const weight = PLATFORM_WEIGHTS.imdb * 0.6 * (1 + voteWeight);
      addContribution(adjustScore(rating), weight, 'imdb');
    }

    // 烂番茄（整体+分季）
    let rtTotal = 0, rtWeight = 0;
    // 整体部分
    if (ratingData.rottentomatoes?.series) {
      const rt = ratingData.rottentomatoes.series;
      const ratings: number[] = [];
      let sum = 0, weight = 0;

      if (rt.tomatometer && isValidScore(rt.tomatometer)) {
        const score = parseFloat(rt.tomatometer)/10;
        ratings.push(score);
        sum += score * PLATFORM_WEIGHTS.rottentomatoes.critics;
        weight += PLATFORM_WEIGHTS.rottentomatoes.critics;
      }

      if (rt.critics_avg && isValidScore(rt.critics_avg)) {
        const score = parseFloat(rt.critics_avg);
        ratings.push(score);
        sum += score * PLATFORM_WEIGHTS.rottentomatoes.critics;
        weight += PLATFORM_WEIGHTS.rottentomatoes.critics;
      }

      if (rt.audience_score && isValidScore(rt.audience_score)) {
        const score = parseFloat(rt.audience_score)/10;
        ratings.push(score);
        sum += score * PLATFORM_WEIGHTS.rottentomatoes.audience;
        weight += PLATFORM_WEIGHTS.rottentomatoes.audience;
      }

      if (rt.audience_avg && isValidScore(rt.audience_avg)) {
        const score = parseFloat(rt.audience_avg) * 2;
        ratings.push(score);
        sum += score * PLATFORM_WEIGHTS.rottentomatoes.audience;
        weight += PLATFORM_WEIGHTS.rottentomatoes.audience;
      }

      if (weight > 0) {
        const variance = calculateVariance(ratings);
        rtTotal += (sum/weight) * 0.6 * (1/(1 + variance));
        rtWeight += PLATFORM_WEIGHTS.rottentomatoes.series * 0.6;
      }
    }
    // 分季部分
    if (tvShowData.rottentomatoes?.seasons?.length) {
      let seasonTotal = 0, validSeasons = 0;
      tvShowData.rottentomatoes.seasons.forEach(season => {
        const ratings: number[] = [];
        let sum = 0, weight = 0;

        // 专业评分
        if (season.tomatometer && season.tomatometer !== '暂无') {
          const tomatometer = parseFloat(season.tomatometer) / 10;
          ratings.push(tomatometer);
          sum += tomatometer * PLATFORM_WEIGHTS.rottentomatoes.critics;
          weight += PLATFORM_WEIGHTS.rottentomatoes.critics;
        }

        // 用户评分
        if (season.audience_score && season.audience_score !== '暂无') {
          const audienceScore = parseFloat(season.audience_score) / 10;
          ratings.push(audienceScore);
          sum += audienceScore * PLATFORM_WEIGHTS.rottentomatoes.audience;
          weight += PLATFORM_WEIGHTS.rottentomatoes.audience;
        }

        if (weight > 0) {
          const variance = calculateVariance(ratings);
          seasonTotal += (sum/weight) * (1/(1 + variance));
          validSeasons++;
        }
      });
      if (validSeasons > 0) {
        rtTotal += (seasonTotal/validSeasons) * 0.4;
        rtWeight += PLATFORM_WEIGHTS.rottentomatoes.season * 0.4;
      }
    }
    addContribution(rtTotal, rtWeight, 'rottentomatoes');

    // Metacritic（整体+分季）
    let mcTotal = 0, mcWeight = 0;
    // 整体部分
    if (ratingData.metacritic?.overall) {
      const mc = ratingData.metacritic.overall;
      const ratings: number[] = [];
      let sum = 0, weight = 0;

      if (mc.metascore && isValidScore(mc.metascore)) {
        const score = parseFloat(mc.metascore)/10;
        ratings.push(score);
        sum += score * PLATFORM_WEIGHTS.metacritic.critics;
        weight += PLATFORM_WEIGHTS.metacritic.critics;
      }

      if (mc.userscore && isValidScore(mc.userscore)) {
        const score = parseFloat(mc.userscore);
        ratings.push(score);
        sum += score * PLATFORM_WEIGHTS.metacritic.users;
        weight += PLATFORM_WEIGHTS.metacritic.users;
      }

      if (weight > 0) {
        const variance = calculateVariance(ratings);
        mcTotal += (sum/weight) * 0.6 * (1/(1 + variance));
        mcWeight += PLATFORM_WEIGHTS.metacritic.series * 0.6;
      }
    }
    // 分季部分
    if (tvShowData.metacritic?.seasons?.length) {
      let seasonTotal = 0, validSeasons = 0;
      tvShowData.metacritic.seasons.forEach(season => {
        const ratings: number[] = [];
        let sum = 0, weight = 0;

        // 专业评分
        if (season.metascore && season.metascore !== '暂无') {
          const metascore = parseFloat(season.metascore) / 10;
          ratings.push(metascore);
          sum += metascore * PLATFORM_WEIGHTS.metacritic.critics;
          weight += PLATFORM_WEIGHTS.metacritic.critics;
        }

        // 用户评分
        if (season.userscore && season.userscore !== '暂无') {
          const userscore = parseFloat(season.userscore);
          ratings.push(userscore);
          sum += userscore * PLATFORM_WEIGHTS.metacritic.users;
          weight += PLATFORM_WEIGHTS.metacritic.users;
        }

        if (weight > 0) {
          const variance = calculateVariance(ratings);
          seasonTotal += (sum/weight) * (1/(1 + variance));
          validSeasons++;
        }
      });
      if (validSeasons > 0) {
        mcTotal += (seasonTotal/validSeasons) * 0.4;
        mcWeight += PLATFORM_WEIGHTS.metacritic.season * 0.4;
      }
    }
    addContribution(mcTotal, mcWeight, 'metacritic');

    // TMDB（整体+分季）
    if (ratingData.tmdb) {
      // 整体部分
      if (ratingData.tmdb.rating) {
        const voteWeight = calculateVoteWeight(ratingData.tmdb.voteCount);
        const weight = PLATFORM_WEIGHTS.tmdb.series * 0.6 * (1 + voteWeight);
        addContribution(adjustScore(ratingData.tmdb.rating), weight, 'tmdb');
      }
      // 分季部分
      if (tvShowData.tmdb?.seasons?.length) {
        let seasonTotal = 0, validSeasons = 0;
        tvShowData.tmdb.seasons.forEach(season => {
          if (season.rating > 0) {
            seasonTotal += adjustScore(season.rating);
            validSeasons++;
          }
        });
        if (validSeasons > 0) {
          const weight = PLATFORM_WEIGHTS.tmdb.season * 0.4 * validSeasons;
          addContribution(seasonTotal/validSeasons, weight, 'tmdb');
        }
      }
    }

    // Trakt（整体+分季）
    if (ratingData.trakt) {
      // 整体部分
      if (ratingData.trakt.rating) {
        const voteWeight = calculateVoteWeight(ratingData.trakt.votes);
        const weight = PLATFORM_WEIGHTS.trakt.series * 0.6 * (1 + voteWeight);
        addContribution(adjustScore(ratingData.trakt.rating), weight, 'trakt');
      }
      // 分季部分
      if (tvShowData.trakt?.seasons?.length) {
        let seasonTotal = 0, validSeasons = 0;
        tvShowData.trakt.seasons.forEach(season => {
          if (season.rating > 0) {
            seasonTotal += adjustScore(season.rating);
            validSeasons++;
          }
        });
        if (validSeasons > 0) {
          const weight = PLATFORM_WEIGHTS.trakt.season * 0.4 * validSeasons;
          addContribution(seasonTotal/validSeasons, weight, 'trakt');
        }
      }
    }

    // Letterboxd（只有整体数据）
    if (ratingData.letterboxd?.rating) {
      const rating = parseFloat(ratingData.letterboxd.rating)*2;
      const voteWeight = calculateVoteWeight(ratingData.letterboxd.rating_count);
      const weight = PLATFORM_WEIGHTS.letterboxd * 0.6 * (1 + voteWeight);
      addContribution(adjustScore(rating), weight, 'letterboxd');
    }
  }

  const finalRating = totalWeight > 0 ? Number((weightedSum/totalWeight).toFixed(1)) : null;

  return {
    rating: finalRating,
    validRatings: validPlatforms.length,
    platforms: validPlatforms
  };
}
