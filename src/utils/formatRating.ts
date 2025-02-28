import { isNil } from 'lodash';

type RatingValue = string | undefined | null;

export const formatRating = {
  // 处理数字格式
  number: (value: RatingValue): number => {
    if (isNil(value) || value === '暂无' || value === 'tbd') return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  },

  // 处理百分比格式
  percentage: (value: string | number | undefined): number | undefined => {
    if (!value || value === '暂无' || value === '0' || value === 'tbd') {
      return undefined;
    }
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    return numValue > 0 ? numValue : undefined;
  },

  // 格式化计数
  count: (value: string | number | undefined): string => {
    if (!value || value === '暂无') return '0';
    
    // 处理带单位的字符串
    if (typeof value === 'string') {
      
      // 处理 M (百万)
      if (value.includes('M')) {
        return value;
      }
      // 处理 K (千) - 保持原始K单位
      if (value.includes('K')) {
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
    return num.toLocaleString();
  },

  // TMDB 评分转换（10分制）
  tmdb: (value: number): number => {
    return Number(value.toFixed(1));
  },

  // Letterboxd 评分转换（5分制转10分制）
  letterboxd: (value: number): number => {
    return Number((value * 2).toFixed(1));
  }
};
