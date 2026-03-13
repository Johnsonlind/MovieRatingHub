// ==========================================
// 电影 API
// ==========================================
import { searchMedia } from './client';
import { transformTMDBMovie } from './transformers';
import type { Movie } from '../types/media';
import { fetchTMDBWithLanguageFallback } from './tmdbLanguageHelper';

export async function getMovie(id: string): Promise<Movie> {
  const data = await fetchTMDBWithLanguageFallback(
    `/api/tmdb-proxy/movie/${id}`,
    {},
    'credits,release_dates'
  );
  
  return transformTMDBMovie(data);
}

export async function searchMovies(query: string, page = 1) {
  return searchMedia('movie', query, page, transformTMDBMovie);
}
