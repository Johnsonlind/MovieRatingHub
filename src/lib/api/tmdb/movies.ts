import { tmdbClient, parseSearchQuery } from './client';
import { transformTMDBMovie } from './transformers';
import type { Movie } from '../../../types/movie';

export async function getMovie(id: string): Promise<Movie> {
  const response = await tmdbClient.get(`/movie/${id}`, {
    params: {
      append_to_response: 'credits,release_dates',
      language: 'zh-CN', // 设置默认语言为中文
    },
  });
  
  return transformTMDBMovie(response.data);
}

export async function searchMovies(query: string, page = 1) {
  const { searchTerm, year, language } = parseSearchQuery(query);
  
  const response = await tmdbClient.get('/search/movie', {
    params: {
      query: searchTerm,
      page,
      include_adult: false,
      language: language || 'zh-CN', // 如果没有检测到特定语言，默认使用中文
      year,
    },
  });

  return {
    results: response.data.results.map(transformTMDBMovie),
    totalPages: response.data.total_pages,
    totalResults: response.data.total_results,
  };
}