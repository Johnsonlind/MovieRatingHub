// ==========================================
// 状态类型
// ==========================================
import type { TMDBRating, TraktRating } from './ratings';
export type { TMDBRating, TraktRating };

export type FetchStatus = 
  | 'pending'
  | 'loading'
  | 'successful'
  | 'error'
  | 'not_found'
  | 'no_rating'
  | 'fail'
  | 'rate_limit'
  | 'timeout'

export interface PlatformStatus {
  status: FetchStatus;
  data: any;
}

export interface PlatformStatuses {
  [key: string]: PlatformStatus;
}

export interface BackendPlatformStatus {
  platform: string;
  logo: string;
  status: FetchStatus;
}

export interface MovieRatingData {
  type: 'movie';
  douban: any | null;
  imdb: any | null;
  letterboxd: any | null;
  rottentomatoes: any | null;
  metacritic: any | null;
  tmdb: TMDBRating | null;
  trakt: TraktRating | null;
}

export interface TVShowRatingData {
  type: 'tv';
  douban: any | null;
  imdb: any | null;
  letterboxd: any | null;
  rottentomatoes: any | null;
  metacritic: any | null;
  tmdb: TMDBRating | null;
  trakt: TraktRating | null;
}

export type RatingData = MovieRatingData | TVShowRatingData;