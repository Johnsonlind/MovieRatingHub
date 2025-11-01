// ==========================================
// TMDB工具 - IMDB ID搜索和媒体详情获取
// ==========================================
import axios from 'axios';
import { TMDB } from './api';
import type { Movie, TVShow } from '../types/media';
import { getImageUrl } from './image';

const api = axios.create({
  baseURL: TMDB.baseUrl,
  params: {
    language: TMDB.language,
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
  const response = await fetch(
    `${TMDB.baseUrl}/${type}/${id}?language=zh-CN&append_to_response=reviews`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch TMDB rating');
  }

  const data = await response.json();

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
  const response = await fetch(
    `${TMDB.baseUrl}/tv/${id}/credits?language=zh-CN`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch TV show credits');
  }

  const data = await response.json();
  
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
    const [details, credits] = await Promise.all([
      fetch(
        `${TMDB.baseUrl}/tv/${id}?language=zh-CN&append_to_response=credits`
      ),
      getTVShowCredits(id)
    ]);

    if (!details.ok) {
      throw new Error('Failed to fetch TV show details');
    }

    const detailsData = await details.json();
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
    
    const response = await fetch(
      `${TMDB.baseUrl}/find/${formattedId}?external_source=imdb_id&language=zh-CN`
    );

    if (!response.ok) {
      throw new Error('查找IMDB ID失败');
    }

    const data = await response.json();
    
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
  const apiKey = process.env.REACT_APP_TMDB_API_KEY;
  const response = await fetch(
    `https://api.themoviedb.org/3/${mediaType}/${mediaId}?api_key=${apiKey}&language=zh-CN`
  );
  
  if (!response.ok) {
    throw new Error('获取影视详情失败');
  }
  
  const data = await response.json();
  return {
    media_id: mediaId,
    media_type: mediaType,
    title: mediaType === 'movie' ? data.title : data.name,
    poster: `https://image.tmdb.org/t/p/w500${data.poster_path}`,
    year: mediaType === 'movie' ? 
      data.release_date?.split('-')[0] : 
      data.first_air_date?.split('-')[0],
    overview: data.overview || '暂无简介'  // 获取剧情简介
  };
}