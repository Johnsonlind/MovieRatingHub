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
  percentage: (value: RatingValue): number => {
    if (isNil(value) || value === '暂无' || value === 'tbd') return 0;
    const num = Number(value.replace('%', ''));
    return isNaN(num) ? 0 : num;
  },

  // 格式化计数
  count: (value: string | number | undefined): string => {
    if (!value || value === '暂无') return '0';
    
    // 处理带单位的字符串
    if (typeof value === 'string') {
      // 处理 M (百万)
      if (value.includes('M')) {
        const num = parseFloat(value);
        return `${(num * 100).toFixed(0)}万`;
      }
      // 处理 K (千)
      if (value.includes('K')) {
        const num = parseFloat(value);
        return `${num}千`;
      }
      // 移除非数字字符并转换为数字
      value = Number(value.toString().replace(/[^0-9.]/g, ''));
    }

    const num = Number(value);
    
    return num.toLocaleString();
  },

  // TMDB 评分转换（10分制）
  tmdb: (value: number): number => {
    return Number(value.toFixed(1));
  }
};
