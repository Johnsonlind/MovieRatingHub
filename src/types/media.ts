// ==========================================
// 媒体类型定义 - 电影和电视剧的数据结构
// ==========================================
export interface MediaBase {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  poster: string;
  imdbId?: string;
  ratings?: {
    douban?: {
      rating: number;
      votes: number;
    };
    imdb?: {
      rating: number;
      votes: number;
    };
    letterboxd?: {
      rating: number;
      votes: number;
    };
    rottentomatoes?: {
      tomatometer: number;
      audienceScore: number;
      criticsCount: number;
      audienceCount: number;
    };
    metacritic?: {
      metascore: number;
      userscore: number;
      criticsCount: number;
      usersCount: number;
    };
    tmdb?: {
      rating: number;
      votes: number;
    };
    trakt?: {
      rating: number;
      votes: number;
    };
  };
  reviews?: {
    douban?: number;
    imdb?: number;
    letterboxd?: number;
    rottentomatoes?: {
      critics: number;
      audience: number;
    };
    metacritic?: {
      critics: number;
      users: number;
    };
  };
}

export interface Movie extends MediaBase {
  type: 'movie';
  releaseDate: string;
  runtime: number;
  genres: string[];
  backdrop: string;
  certification?: string;
  credits: {
    cast: Array<{
      name: string;
      character: string;
      profilePath?: string;
    }>;
    crew: Array<{
      name: string;
      job: string;
      profilePath?: string;
    }>;
  };
}

interface Ratings {
  douban?: number;
  imdb?: number;
  rottenTomatoes?: {
    critic?: number;
    audience?: number;
  };
  metacritic?: {
    critic?: number;
    user?: number;
  };
  letterboxd?: number;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string;
  ratings: Ratings;
}

interface BaseMedia {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  type: 'movie' | 'tv';
  poster: string;
  backdrop: string;
  year: number;
}

export interface TVShow extends BaseMedia {
  type: 'tv';
  selectedSeason?: number;
  firstAirDate: string;
  lastAirDate?: string;
  status: string;
  genres: string[];
  numberOfSeasons: number;
  seasons: Array<{
    seasonNumber: number;
    name: string;
    episodeCount: number;
    airDate: string;
    poster?: string;
  }>;
  credits: {
    cast: Array<{
      name: string;
      character: string;
      profilePath?: string;
      order?: number;
    }>;
    crew: Array<{
      name: string;
      job: string;
      profilePath?: string;
    }>;
  };
}

export type Media = TVShow | Movie;