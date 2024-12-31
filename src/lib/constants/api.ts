export const TMDB = {
  apiKey: 'c45274c2aafa25a5c50c8ce732a22483',
  baseUrl: 'https://api.themoviedb.org/3',
  imageBaseUrl: 'https://image.tmdb.org/t/p',
  posterSizes: {
    小: 'w185',
    中: 'w342',
    大: 'w500',
    原始: 'original'
  } as const,
  language: 'zh-CN',
} as const;