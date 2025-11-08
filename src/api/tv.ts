// ==========================================
// 电视剧API - 获取剧集详情和搜索
// ==========================================
import { tmdbClient, parseSearchQuery } from './client';
import { transformTMDBTVShow } from './transformers';
import type { TVShow } from '../types/media';
import { fetchTMDBWithLanguageFallback, getPrimaryLanguage } from './tmdbLanguageHelper';

export async function getTVShow(id: string): Promise<TVShow> {
  const data = await fetchTMDBWithLanguageFallback(
    `/api/tmdb-proxy/tv/${id}`,
    {},
    'credits,external_ids'
  );
  
  return transformTMDBTVShow(data);
}

export async function searchTVShows(query: string, page = 1) {
  const { searchTerm, year, language } = parseSearchQuery(query);
  
  const response = await tmdbClient.get('/search/tv', {
    params: {
      query: searchTerm,
      page,
      include_adult: false,
      language: language || getPrimaryLanguage(),
      first_air_date_year: year,
    },
  });

  return {
    results: response.data.results.map(transformTMDBTVShow),
    totalPages: response.data.total_pages,
    totalResults: response.data.total_results,
  };
}
