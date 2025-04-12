// ==========================================
// API 配置
// ==========================================
export const TMDB = {
  baseUrl: '/api/tmdb-proxy',
  imageBaseUrl: '/tmdb-images',
  posterSizes: {
    小: 'w185',
    中: 'w342',
    大: 'w500',
    原始: 'original'
  } as const,
  language: 'zh-CN',
  findEndpoint: '/find'
} as const;

export const TRAKT = {
  clientId: '859d1ad30074136a934c47ba2083cda83620b17b0db8f2d0ec554922116c60a8',
  clientSecret: '9bf4e89fd8753de50375c8e2e17114a141f5ae2dba5c736f6212197bd4229681',
  baseUrl: 'https://api.trakt.tv',
} as const;