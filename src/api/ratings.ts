// ==========================================
// TMDB API
// ==========================================
import axios from 'axios';
import { TMDB } from './api';
import type { Movie, TVShow } from '../types/media';
import { getImageUrl } from '../utils/image';

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
    `${TMDB.baseUrl}/${type}/${id}?language=zh-CN?append_to_response=reviews`
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
        `${TMDB.baseUrl}/tv/${id}?language=zh-CN?append_to_response=credits`
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
