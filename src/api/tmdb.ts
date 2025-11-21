// ==========================================
// TMDB工具 - IMDB ID搜索和媒体详情获取
// ==========================================
import axios from 'axios';
import { TMDB } from './api';
import type { Movie, TVShow } from '../types/media';
import { getImageUrl } from './image';
import { fetchTMDBWithLanguageFallback, getPrimaryLanguage } from './tmdbLanguageHelper';

const api = axios.create({
  baseURL: TMDB.baseUrl,
  params: {
    language: getPrimaryLanguage(),
  },
});

function transformTMDBMovie(data: any): Movie {
  return {
    type: 'movie',
    id: data.id,
    title: data.title,
    originalTitle: data.original_title,
    year: new Date(data.release_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '大', 'poster'),
    backdrop: getImageUrl(data.backdrop_path, '大', 'poster'),
    overview: data.overview,
    releaseDate: data.release_date,
    runtime: data.runtime,
    genres: data.genres?.map((g: any) => g.name) || [],
    credits: data.credits,
  };
}

function transformTMDBTVShow(data: any): TVShow {
  return {
    type: 'tv',
    id: data.id,
    title: data.name,
    originalTitle: data.original_name,
    year: new Date(data.first_air_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '大', 'poster'),
    backdrop: getImageUrl(data.backdrop_path, '大', 'poster'),
    overview: data.overview,
    firstAirDate: data.first_air_date,
    lastAirDate: data.last_air_date,
    numberOfSeasons: data.number_of_seasons,
    status: data.status,
    genres: data.genres?.map((g: any) => g.name) || [],
    seasons: data.seasons?.map((s: any) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      airDate: s.air_date,
      poster: getImageUrl(s.poster_path, '大', 'poster'),
    })) || [],
    credits: data.credits,
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

export async function fetchTMDBRating(type: 'movie' | 'tv', id: number) {
  const data = await fetchTMDBWithLanguageFallback(
    `${TMDB.baseUrl}/${type}/${id}`,
    {},
    'reviews'
  );

  return {
    rating: data.vote_average,
    voteCount: data.vote_count,
    ...(type === 'tv' && data.seasons && {
      seasons: data.seasons.map((s: any) => ({
        season_number: s.season_number,
        rating: s.vote_average,
        voteCount: s.vote_count
      }))
    })
  };
}

export async function getTVShowCredits(id: number) {
  const data = await fetchTMDBWithLanguageFallback(
    `${TMDB.baseUrl}/tv/${id}/credits`
  );
  
  return {
    cast: data.cast.map((member: any) => ({
      name: member.name,
      character: member.character,
      profilePath: member.profile_path,
      order: member.order
    })),
    crew: data.crew.map((member: any) => ({
      name: member.name,
      job: member.job,
      profilePath: member.profile_path
    }))
  };
}

export async function getTVShow(id: number): Promise<TVShow> {
  try {
    const [detailsData, credits] = await Promise.all([
      fetchTMDBWithLanguageFallback(
        `${TMDB.baseUrl}/tv/${id}`,
        {},
        'credits'
      ),
      getTVShowCredits(id)
    ]);

    return transformTMDBTVShow({
      ...detailsData,
      credits
    });
  } catch (error) {
    console.error('Error fetching TV show:', error);
    throw error;
  }
}

export async function searchByImdbId(imdbId: string): Promise<{ movies: Movie[], tvShows: TVShow[] }> {
  try {
    // 确保IMDB ID格式正确
    const formattedId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
    
    const data = await fetchTMDBWithLanguageFallback(
      `${TMDB.baseUrl}/find/${formattedId}`,
      { external_source: 'imdb_id' }
    );
    
    // 打印返回数据以便调试
    console.log('TMDB find response:', data);
    
    return {
      movies: (data.movie_results || []).map(transformTMDBMovie),
      tvShows: (data.tv_results || []).map(transformTMDBTVShow)
    };
  } catch (error) {
    console.error('通过IMDB ID搜索失败:', error);
    return { movies: [], tvShows: [] };
  }
}

export async function getMediaDetails(mediaType: string, mediaId: string) {
  const data = await fetchTMDBWithLanguageFallback(
    `/api/tmdb-proxy/${mediaType}/${mediaId}`
  );
  
  let posterPath = '';
  if (data.poster_path) {
    posterPath = `/tmdb-images${data.poster_path}`;
  }
  
  return {
    media_id: mediaId,
    media_type: mediaType,
    title: mediaType === 'movie' ? data.title : data.name,
    poster: posterPath,
    year: mediaType === 'movie' ? 
      data.release_date?.split('-')[0] : 
      data.first_air_date?.split('-')[0],
    overview: data.overview || '暂无简介'  // 获取剧情简介
  };
}
