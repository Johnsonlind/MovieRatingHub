export const formatRating = {
  number: (value: string | undefined | null, defaultValue = '0'): number => {
    if (!value || value === '暂无' || value === 'tbd') {
      return Number(defaultValue);
    }
    return Number(value.replace('%', ''));
  },

  percentage: (value: string | undefined | null): number => {
    if (!value || value === '暂无' || value === 'tbd') {
      return 0;
    }
    return Number(value.replace('%', ''));
  },

  count: (value: string | undefined | null): string => {
    if (!value || value === '暂无' || value === 'tbd') {
      return '暂无';
    }
    return value;
  },

  tmdb: (value: number | undefined | null): string => {
    if (!value) return '暂无';
    return (Math.round(value * 10) / 10).toFixed(1);
  },

  letterboxd: (value: string | number | undefined | null): number => {
    if (!value || value === '暂无' || value === 'tbd') return 0;
    const rating = Number(value);
    return isNaN(rating) ? 0 : rating * 2; // 5分制转10分制
  }
}; 