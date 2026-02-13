// ==========================================
// 外部 API 数据转换
// ==========================================
import type { Movie, TVShow } from '../types/media';
import { getImageUrl } from './image';
import { getChineseJobTitle } from '../types/jobTitles';

export function transformTMDBMovie(data: any): Movie {
  return {
    type: 'movie',
    id: Number(data.id),
    title: data.title,
    originalTitle: data.original_title,
    year: new Date(data.release_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '列表', 'poster'),
    backdrop: getImageUrl(data.backdrop_path, '原始', 'poster'),
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
    id: Number(data.id),
    title: data.name,
    originalTitle: data.original_name,
    year: new Date(data.first_air_date).getFullYear(),
    poster: getImageUrl(data.poster_path, '列表', 'poster'),
    backdrop: getImageUrl(data.backdrop_path, '原始', 'poster'),
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
          job: getChineseJobTitle(member.job),
          profilePath: member.profile_path 
            ? getImageUrl(member.profile_path, '中', 'profile')
            : '/placeholder-avatar.png',
        })),
    },
  };
}
