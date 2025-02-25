// TMDB 配置
export const TMDB_API_KEY = '4f681fa7b5ab7346a4e184bbf2d41715';
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const POSTER_SIZES = {
  small: 'w185',
  medium: 'w342',
  large: 'w500',
  original: 'original'
} as const;

// CDN 配置
export const CDN_URL = process.env.NODE_ENV === 'production' 
  ? 'https://cdn.jsdelivr.net/gh/Johnsonlind/MovieRatingHub@main/public'
  : '';