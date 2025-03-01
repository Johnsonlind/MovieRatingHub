// ==========================================
// TMDB API 剧集
// ==========================================
import { tmdbClient, parseSearchQuery } from './client';
import { transformTMDBTVShow } from './transformers';
import type { TVShow } from '../types/media';

export async function getTVShow(id: string): Promise<TVShow> {
  const response = await tmdbClient.get(`/tv/${id}`, {
    params: {
      append_to_response: 'credits,external_ids',
      language: 'zh-CN',
    },
  });
  
  return transformTMDBTVShow(response.data);
}

export async function searchTVShows(query: string, page = 1) {
  const { searchTerm, year, language } = parseSearchQuery(query);
  
  const response = await tmdbClient.get('/search/tv', {
    params: {
      query: searchTerm,
      page,
      include_adult: false,
      language: language || 'zh-CN',
      first_air_date_year: year,
    },
  });

  return {
    results: response.data.results.map(transformTMDBTVShow),
    totalPages: response.data.total_pages,
    totalResults: response.data.total_results,
  };
}