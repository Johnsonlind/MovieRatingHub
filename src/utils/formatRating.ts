// ==========================================
// 评分格式化
// ==========================================
import { isNil } from 'lodash';

type RatingValue = string | number | undefined | null;

export const formatRating = {
  // 处理数字格式
  number: (value: RatingValue, defaultValue = 0): number => {
    if (isNil(value) || value === '暂无' || value === 'tbd') return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  },

  // 处理百分比格式
  percentage: (value: RatingValue): number | undefined => {
    if (isNil(value) || value === '暂无' || value === '0' || value === 'tbd') {
      return undefined;
    }
    
    // 处理百分比字符串
    if (typeof value === 'string' && value.includes('%')) {
      value = value.replace('%', '');
    }
    
    const numValue = typeof value === 'string' ? parseInt(value) : Number(value);
    return numValue > 0 ? numValue : undefined;
  },

  // 格式化计数
  count: (value: RatingValue): string => {
    if (isNil(value) || value === '暂无' || value === 'tbd') return '0';
    
    // 处理带单位的字符串
    if (typeof value === 'string') {
      // 处理 M (百万)和 K (千)单位 - 保持原始单位
      if (value.includes('M') || value.includes('K')) {
        return value;
      }
      // 移除非数字字符（保留加号）并转换为数字
      const numStr = value.replace(/[^0-9.+]/g, '');
      if (numStr.includes('+')) {
        return numStr;
      }
      value = Number(numStr);
    }

    const num = Number(value);
    return isNaN(num) ? '0' : num.toLocaleString();
  },

  // TMDB 评分转换（10分制）
  tmdb: (value: RatingValue): string | number => {
    if (isNil(value)) return '暂无';
    const num = Number(value);
    return isNaN(num) ? '暂无' : Number(num.toFixed(1));
  },

  // Letterboxd 评分转换（5分制转10分制）
  letterboxd: (value: RatingValue): number => {
    if (isNil(value) || value === '暂无' || value === 'tbd') return 0;
    const rating = Number(value);
    return isNaN(rating) ? 0 : Number((rating * 2).toFixed(1));
  }
};