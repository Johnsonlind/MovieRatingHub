import type { MovieRatingData, TVShowRatingData } from '../types/ratings';

export function isTVShowRatingData(data: MovieRatingData | TVShowRatingData): data is TVShowRatingData {
  return data.type === 'tv';
} 