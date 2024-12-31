import axios from 'axios';
import { TMDB } from '../constants/api';
import type { Movie, TVShow, Media } from '../../types/media';
import { getImageUrl } from '../utils/image';

const api = axios.create({
  baseURL: TMDB.baseUrl,
  params: {
    api_key: TMDB.apiKey,
    language: TMDB.language,
  },
});

function transformTMDBMovie(data: any): Movie {
  return {
    type: 'movie',
    id: String(data.id),
    title: data.title,
    originalTitle: data.original_title,
    year: new Date(data.release_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '大', 'poster'),
    overview: data.overview,
    // ... other movie specific transformations
  };
}

function transformTMDBTVShow(data: any): TVShow {
  return {
    type: 'tv',
    id: String(data.id),
    title: data.name,
    originalTitle: data.original_name,
    year: new Date(data.first_air_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '大', 'poster'),
    overview: data.overview,
    firstAirDate: data.first_air_date,
    lastAirDate: data.last_air_date,
    numberOfSeasons: data.number_of_seasons,
    status: data.status,
  };
}

export async function searchMedia(query: string): Promise<{ movies: Movie[], tvShows: TVShow[] }> {
  const [movieResponse, tvResponse] = await Promise.all([
    api.get('/search/movie', {
      params: { query, page: 1, include_adult: false },
    }),
    api.get('/search/tv', {
      params: { query, page: 1, include_adult: false },
    }),
  ]);

  return {
    movies: movieResponse.data.results.slice(0, 10).map(transformTMDBMovie),
    tvShows: tvResponse.data.results.slice(0, 10).map(transformTMDBTVShow),
  };
}