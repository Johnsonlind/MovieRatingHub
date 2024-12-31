import { TMDB } from '../constants/api';

const DEFAULT_AVATAR = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

export function getImageUrl(
  path: string | null | undefined,
  size: keyof typeof TMDB.posterSizes = '中',
  type: 'poster' | 'profile' = 'poster'
): string {
  if (!path) {
    return type === 'profile' ? DEFAULT_AVATAR : '';
  }
  return `${TMDB.imageBaseUrl}/${TMDB.posterSizes[size]}${path}`;
}