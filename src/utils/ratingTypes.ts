// ==========================================
// 评分计算内部类型定义
// ==========================================

/**
 * 统一的评分数据结构（计算层）
 * 所有平台评分在计算时都会被转换为这个统一结构
 */
export interface NormalizedRating {
  platform: 'douban' | 'imdb' | 'rt' | 'mc' | 'tmdb' | 'trakt' | 'letterboxd';
  type: 'critic' | 'user';
  score: number;           // 已标准化为 0-10 分制
  voteCount?: number;      // 评分人数，允许缺失
  platformLabel?: string;  // 用于显示的平台标签（如 rottentomatoes_critics）
  season?: number;         // 季度编号（仅用于剧集）
}

/**
 * 评分贡献值计算结果
 */
export interface RatingContribution {
  rating: NormalizedRating;
  effectiveVotes: number;      // 有效评分人数（经过对数转换）
  platformWeight: number;      // 平台权重
  typeWeight: number;          // 类型权重
  contribution: number;        // 总贡献值
  weightedVotes: number;       // 加权后的有效评分人数
}

/**
 * 分流计算状态
 */
export interface SeparatedCalculationState {
  criticContributions: RatingContribution[];
  userContributions: RatingContribution[];
  criticSum: number;
  criticWeightSum: number;
  userSum: number;
  userWeightSum: number;
}
