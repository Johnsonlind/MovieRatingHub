export interface Movie {
  id: string;
  title: string;
  originalTitle: string;
  year: number;
  poster: string;
  backdrop?: string;
  overview: string;
  imdbId: string;
  releaseDate: string;
  runtime?: number;
  genres: string[];
  certification?: string;
  credits: {
    cast: {
      name: string;
      character: string;
      profilePath?: string;
    }[];
    crew: {
      name: string;
      job: string;
      department: string;
    }[];
  };
  ratings: {
    douban: number | null;
    imdb: number | null;
    rottenTomatoesCritic: number | null;
    rottenTomatoesAudience: number | null;
    metacriticCritic: number | null;
    metacriticUser: number | null;
    letterboxd: number | null;
  };
  reviews: {
    rottenTomatoesCritic: number | null;
    rottenTomatoesAudience: number | null;
    metacriticCritic: number | null;
    metacriticUser: null;
  };
}