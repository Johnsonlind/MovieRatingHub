// ==========================================
// API 配置
// ==========================================
import { getPrimaryLanguage } from './tmdbLanguageHelper';

export const TMDB = {
  baseUrl: '/api/tmdb-proxy',
  imageBaseUrl: '/tmdb-images',
  posterSizes: {
    小: 'w185',
    中: 'w342',
    大: 'w500',
    原始: 'original'
  } as const,
  get language() {
    return getPrimaryLanguage();
  },
  findEndpoint: '/find'
} as const;

export const TRAKT = {
  clientId: 'db74b025288459dc36589f6207fb96aabd83be8ea5d502810a049c29ffd9bff0',
  clientSecret: '2f98dc6b1a35c090c244fcfc683510547ff63d1404742e32e74403a56378dce9',
  baseUrl: '/api/trakt-proxy',
} as const;
