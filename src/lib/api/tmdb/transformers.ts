import type { Movie, TVShow } from '../../../types/media';
import { getImageUrl } from '../../utils/image';
import { translateJob } from '../../utils/translations';

export function transformTMDBMovie(data: any): Movie {
  return {
    type: 'movie',
    id: String(data.id),
    title: data.title,
    originalTitle: data.original_title,
    year: new Date(data.release_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '大', 'poster'),
    backdrop: getImageUrl(data.backdrop_path, '原始', 'backdrop'),
    overview: data.overview,
    releaseDate: data.release_date,
    runtime: data.runtime,
    genres: (data.genres || []).map((g: any) => g.name),
    credits: {
      cast: (data.credits?.cast || []).slice(0, 10).map((member: any) => ({
        name: member.name,
        character: member.character,
        profilePath: getImageUrl(member.profile_path, '中', 'profile'),
      })),
      crew: (data.credits?.crew || [])
        .filter((member: any) => ['Director', 'Writer', 'Producer'].includes(member.job))
        .map((member: any) => ({
          name: member.name,
          job: member.job,
          department: member.department,
        })),
    },
  };
}

export function transformTMDBTVShow(data: any): TVShow {
  return {
    type: 'tv',
    id: String(data.id),
    title: data.name,
    originalTitle: data.original_name,
    year: new Date(data.first_air_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '大', 'poster'),
    backdrop: getImageUrl(data.backdrop_path, '原始', 'backdrop'),
    overview: data.overview,
    firstAirDate: data.first_air_date,
    lastAirDate: data.last_air_date,
    numberOfSeasons: data.number_of_seasons,
    status: data.status,
    genres: (data.genres || []).map((g: any) => g.name),
    seasons: (data.seasons || []).map((season: any) => ({
      seasonNumber: season.season_number,
      name: season.name,
      episodeCount: season.episode_count,
      rating: season.vote_average || 0,
      airDate: season.air_date,
    })),
    credits: {
      cast: (data.credits?.cast || []).slice(0, 10).map((member: any) => ({
        name: member.name,
        character: member.character || '演员',
        profilePath: member.profile_path 
          ? getImageUrl(member.profile_path, '中', 'profile')
          : '/placeholder-avatar.png',
      })),
      crew: (data.credits?.crew || [])
        .filter((member: any) => 
          ['Director', 'Executive Producer', 'Producer', 'Writer', 'Creator'].includes(member.job)
        )
        .map((member: any) => ({
          name: member.name,
          job: translateJob(member.job),
          department: translateJob(member.department),
          profilePath: member.profile_path 
            ? getImageUrl(member.profile_path, '中', 'profile')
            : '/placeholder-avatar.png',
        })),
    },
    ratings: {
      douban: null,
      imdb: data.vote_average || null,
      rottenTomatoes: {
        critic: null,
        audience: null,
      },
      metacritic: {
        critic: null,
        user: null,
      },
      letterboxd: null,
    },
  };
}