// ==========================================
// 评分算法常量定义
// ==========================================

/**
 * 平台基础权重
 * 专业评分平台（RT、MC）的专业评分权重更高
 * 用户评分平台权重相对较低
 */
export const PLATFORM_WEIGHT = {
  douban: 1.1,
  imdb: 1.1,
  rt: {
    critic: 1.2,
    user: 0.9
  },
  mc: {
    critic: 1.2,
    user: 0.9
  },
  tmdb: 0.8,
  trakt: 0.8,
  letterboxd: 0.9
} as const;

/**
 * 评分类型权重
 * 专业评分（critic）权重略高于用户评分
 */
export const TYPE_WEIGHT = {
  critic: 1.1,
  user: 1.0
} as const;

/**
 * 最终评分合并比例
 * 专业评分占 40%，用户评分占 60%
 */
export const FINAL_CRITIC_RATIO = 0.4;
export const FINAL_USER_RATIO = 0.6;

/**
 * 缺失评分人数的降权系数
 * 对于没有评分人数的平台，使用中位数但额外降权
 */
export const MISSING_VOTE_COUNT_PENALTY = 0.7;

/**
 * 默认最小评分人数（当所有平台都没有评分人数时的兜底值）
 */
export const DEFAULT_FALLBACK_VOTES = 1000;
