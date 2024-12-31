export interface MediaBase {
  id: string;
  title: string;
  originalTitle: string;
  year: number;
  poster: string;
  overview: string;
}

export interface Movie extends MediaBase {
  type: 'movie';
  // ... existing Movie specific fields
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

export interface TVShow extends MediaBase {
  type: 'tv';
  firstAirDate: string;
  lastAirDate?: string;
  numberOfSeasons?: number;
  status?: string;
  seasons?: Season[];
  ratings?: Ratings;
}

export type Media = Movie | TVShow;