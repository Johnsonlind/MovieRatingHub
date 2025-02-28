import type { MediaBase } from './media';

interface Cast {
  name: string;
  character: string;
  profilePath?: string;
}

interface Crew {
  name: string;
  job: string;
  profilePath?: string;
}

export interface Movie extends MediaBase {
  type: 'movie';
  backdrop: string;
  certification?: string;
  releaseDate: string;
  runtime?: number;
  genres: string[];
  credits: {
    cast: Cast[];
    crew: Crew[];
  };
}