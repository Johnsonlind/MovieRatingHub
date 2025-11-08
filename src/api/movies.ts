// ==========================================
// 电影API - 获取电影详情和搜索
// ==========================================
import { tmdbClient, parseSearchQuery } from './client';
import { transformTMDBMovie } from './transformers';
import type { Movie } from '../types/media';
import { fetchTMDBWithLanguageFallback, getPrimaryLanguage } from './tmdbLanguageHelper';

export async function getMovie(id: string): Promise<Movie> {
  const data = await fetchTMDBWithLanguageFallback(
    `/api/tmdb-proxy/movie/${id}`,
    {},
    'credits,release_dates'
  );
  
  return transformTMDBMovie(data);
}

export async function searchMovies(query: string, page = 1) {
  const { searchTerm, year, language } = parseSearchQuery(query);
  
  const response = await tmdbClient.get('/search/movie', {
    params: {
      query: searchTerm,
      page,
      include_adult: false,
      language: language || getPrimaryLanguage(),
      year,
    },
  });

  return {
    results: response.data.results.map(transformTMDBMovie),
    totalPages: response.data.total_pages,
    totalResults: response.data.total_results,
  };
}
