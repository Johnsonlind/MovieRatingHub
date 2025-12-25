// ==========================================
// 稳健评分算法核心实现
// ==========================================
import type { NormalizedRating, RatingContribution, SeparatedCalculationState } from './ratingTypes';
import { 
  PLATFORM_WEIGHT, 
  TYPE_WEIGHT, 
  FINAL_CRITIC_RATIO, 
  FINAL_USER_RATIO,
  MISSING_VOTE_COUNT_PENALTY,
  DEFAULT_FALLBACK_VOTES
} from './ratingConstants';

/**
 * 计算有效评分人数（对数转换）
 * 使用 log10(voteCount + 1) 来降低大数值的影响
 */
export function calculateEffectiveVotes(voteCount: number): number {
  return Math.log10(voteCount + 1);
}

/**
 * 计算所有有效评分人数的中位数（对数空间）
 * 用于处理缺失评分人数的情况
 */
export function calculateFallbackVotes(ratings: NormalizedRating[]): number {
  const validVoteCounts = ratings
    .filter(r => r.voteCount !== undefined && r.voteCount > 0)
    .map(r => calculateEffectiveVotes(r.voteCount!));

  if (validVoteCounts.length === 0) {
    // 如果所有评分都没有人数，使用默认值的对数
    return calculateEffectiveVotes(DEFAULT_FALLBACK_VOTES);
  }

  // 计算中位数
  validVoteCounts.sort((a, b) => a - b);
  const mid = Math.floor(validVoteCounts.length / 2);
  
  if (validVoteCounts.length % 2 === 0) {
    return (validVoteCounts[mid - 1] + validVoteCounts[mid]) / 2;
  } else {
    return validVoteCounts[mid];
  }
}

/**
 * 获取平台权重
 */
export function getPlatformWeight(rating: NormalizedRating): number {
  const platform = rating.platform;
  
  switch (platform) {
    case 'douban':
      return PLATFORM_WEIGHT.douban;
    case 'imdb':
      return PLATFORM_WEIGHT.imdb;
    case 'rt':
      return rating.type === 'critic' ? PLATFORM_WEIGHT.rt.critic : PLATFORM_WEIGHT.rt.user;
    case 'mc':
      return rating.type === 'critic' ? PLATFORM_WEIGHT.mc.critic : PLATFORM_WEIGHT.mc.user;
    case 'tmdb':
      return PLATFORM_WEIGHT.tmdb;
    case 'trakt':
      return PLATFORM_WEIGHT.trakt;
    case 'letterboxd':
      return PLATFORM_WEIGHT.letterboxd;
    default:
      return 1.0;
  }
}

/**
 * 获取类型权重
 */
export function getTypeWeight(type: 'critic' | 'user'): number {
  return TYPE_WEIGHT[type];
}

/**
 * 计算单条评分的贡献值
 */
export function calculateRatingContribution(
  rating: NormalizedRating,
  fallbackVotes: number
): RatingContribution {
  // 计算有效评分人数
  let effectiveVotes: number;
  
  if (rating.voteCount !== undefined && rating.voteCount > 0) {
    effectiveVotes = calculateEffectiveVotes(rating.voteCount);
  } else {
    // 缺失评分人数：使用中位数并降权
    effectiveVotes = fallbackVotes * MISSING_VOTE_COUNT_PENALTY;
  }

  // 获取权重
  const platformWeight = getPlatformWeight(rating);
  const typeWeight = getTypeWeight(rating.type);

  // 计算加权后的有效评分人数
  const weightedVotes = effectiveVotes * platformWeight * typeWeight;

  // 计算贡献值
  const contribution = rating.score * weightedVotes;

  return {
    rating,
    effectiveVotes,
    platformWeight,
    typeWeight,
    contribution,
    weightedVotes
  };
}

/**
 * 将评分按专业/用户类型分流并计算
 */
export function separateAndCalculate(ratings: NormalizedRating[]): SeparatedCalculationState {
  if (ratings.length === 0) {
    return {
      criticContributions: [],
      userContributions: [],
      criticSum: 0,
      criticWeightSum: 0,
      userSum: 0,
      userWeightSum: 0
    };
  }

  // 计算 fallback votes
  const fallbackVotes = calculateFallbackVotes(ratings);

  // 计算所有评分的贡献值
  const contributions = ratings.map(rating => 
    calculateRatingContribution(rating, fallbackVotes)
  );

  // 分流
  const criticContributions = contributions.filter(c => c.rating.type === 'critic');
  const userContributions = contributions.filter(c => c.rating.type === 'user');

  // 计算专业评分汇总
  const criticSum = criticContributions.reduce((sum, c) => sum + c.contribution, 0);
  const criticWeightSum = criticContributions.reduce((sum, c) => sum + c.weightedVotes, 0);

  // 计算用户评分汇总
  const userSum = userContributions.reduce((sum, c) => sum + c.contribution, 0);
  const userWeightSum = userContributions.reduce((sum, c) => sum + c.weightedVotes, 0);

  return {
    criticContributions,
    userContributions,
    criticSum,
    criticWeightSum,
    userSum,
    userWeightSum
  };
}

/**
 * 计算最终综合评分
 * 专业评分和用户评分按固定比例合并
 */
export function calculateFinalScore(state: SeparatedCalculationState): number | null {
  const { criticSum, criticWeightSum, userSum, userWeightSum } = state;

  // 如果两种评分都没有，返回 null
  if (criticWeightSum === 0 && userWeightSum === 0) {
    return null;
  }

  // 计算专业评分和用户评分
  const criticScore = criticWeightSum > 0 ? criticSum / criticWeightSum : 0;
  const userScore = userWeightSum > 0 ? userSum / userWeightSum : 0;

  // 根据实际情况调整比例
  let finalScore: number;

  if (criticWeightSum > 0 && userWeightSum > 0) {
    // 两种评分都有，按固定比例合并
    finalScore = criticScore * FINAL_CRITIC_RATIO + userScore * FINAL_USER_RATIO;
  } else if (criticWeightSum > 0) {
    // 只有专业评分
    finalScore = criticScore;
  } else {
    // 只有用户评分
    finalScore = userScore;
  }

  // 四舍五入到一位小数
  return Math.round(finalScore * 10) / 10;
}

/**
 * 完整的稳健评分计算流程
 * 这是对外暴露的主要函数
 */
export function calculateRobustRating(ratings: NormalizedRating[]): {
  finalScore: number | null;
  state: SeparatedCalculationState;
} {
  const state = separateAndCalculate(ratings);
  const finalScore = calculateFinalScore(state);

  return {
    finalScore,
    state
  };
}
