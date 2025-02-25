// TMDB 评分类型定义
export interface TMDBRating {
  rating: number;
  voteCount: number;
  seasons?: Array<{
    season_number: number;
    rating: number;
    voteCount: number;
  }>;
}

// Trakt 评分类型定义
export interface TraktRating {
  rating: number;
  votes: number;
  distribution?: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
    '6': number;
    '7': number;
    '8': number;
    '9': number;
    '10': number;
  };
  seasons?: Array<{
    season_number: number;
    rating: number;
    votes: number;
    distribution?: Record<string, number>;
  }>;
}

// Rotten Tomatoes 基础数据结构
export interface RTSeriesData {
  tomatometer: string;
  audience_score: string;
  critics_avg: string;
  critics_count: string;
  audience_count: string;
  audience_avg: string;
}

// Metacritic 基础数据结构
export interface MCOverallData {
  metascore: string;
  critics_count: string;
  userscore: string;
  users_count: string;
}

// 电影评分数据
export interface MovieRatingData {
  type: 'movie';
  douban: DoubanRating | null;
  imdb: IMDBRating | null;
  letterboxd: LetterboxdRating | null;
  rottentomatoes: RottenTomatoesRating | null;
  metacritic: MetacriticRating | null;
  tmdb: TMDBRating | null;
  trakt: TraktRating | null;
}

// 剧集评分数据
export interface TVShowRatingData {
  type: 'tv';
  seasons?: Array<{
    season_number: number;
    douban?: {
      rating: string;
      rating_people: string;
    };
    rottentomatoes?: {
      tomatometer: string;
      audience_score: string;
      critics_avg: string;
      audience_avg: string;
    };
    metacritic?: {
      metascore: string;
      userscore: string;
    };
    tmdb?: {
      rating: number;
      voteCount: number;
    };
    trakt?: {
      rating: number;
      votes: number;
      distribution?: Record<string, number>;
    };
  }>;
  douban?: {
    rating: string;
    rating_people: string;
    seasons?: Array<{
      season_number: number;
      rating: string;
      rating_people: string;
    }>;
  };
  imdb?: {
    rating: string;
    rating_people: string;
  };
  letterboxd?: {
    status: string;
    rating: string;
    rating_count: string;
  };
  rottentomatoes?: {
    series?: {
      tomatometer: string;
      audience_score: string;
      critics_avg: string;
      audience_avg: string;
      critics_count: string;
      audience_count: string;
    };
    seasons?: Array<{
      season_number: number;
      tomatometer: string;
      audience_score: string;
      critics_avg: string;
      audience_avg: string;
      critics_count: string;
      audience_count: string;
    }>;
  };
  metacritic?: {
    overall?: {
      metascore: string;
      userscore: string;
      critics_count: string;
      users_count: string;
    };
    seasons?: Array<{
      season_number: number;
      metascore: string;
      userscore: string;
      critics_count: string;
      users_count: string;
    }>;
  };
  tmdb?: {
    rating: number;
    voteCount: number;
    seasons?: Array<{
      season_number: number;
      rating: number;
      voteCount: number;
    }>;
  };
  trakt?: {
    rating: number;
    votes: number;
    seasons?: Array<{
      season_number: number;
      rating: number;
      votes: number;
      voteCount?: number;
      distribution?: any;
    }>;
  };
}

// 类型保护函数
export function isTVShowRatingData(data: MovieRatingData | TVShowRatingData): data is TVShowRatingData {
  return data.type === 'tv';
}

export interface SeasonRating {
  season_number: number;
  tomatometer: string;
  audience_score: string;
  critics_avg: string;
  audience_avg: string;
  critics_count: string;
  audience_count: string;
}

export interface RTSeasonRating {
  season_number: number;
  tomatometer: string;
  audience_score: string;
  critics_avg: string;
  audience_avg: string;
  critics_count: string;
  audience_count: string;
}

export interface MCSeasonRating {
  season_number: number;
  metascore: string;
  critics_count: string;
  userscore: string;
  users_count: string;
}

export interface MetacriticSeasonRating {
  season_number: number;
  metascore: string;
  critics_count: string;
  userscore: string;
  users_count: string;
}

export interface RottenTomatoesSeasonRating {
  season_number: number;
  tomatometer: string;
  audience_score: string;
  critics_avg: string;
  audience_avg: string;
  critics_count: string;
  audience_count: string;
}

// 导出联合类型
export type RatingData = MovieRatingData | TVShowRatingData; 
export type FetchStatus = 'pending' | 'loading' | 'successful' | 'fail' | 'not_found' | 'no_rating' | 'error' | 'rate_limit' | 'timeout';

export interface PlatformStatus {
  status: FetchStatus;
  data: any;
}

export interface PlatformStatuses {
  [key: string]: PlatformStatus;
}

// 豆瓣评分类型定义
export interface DoubanRating {
  rating: string;
  rating_people: string;
  seasons?: Array<{
    season_number: number;
    rating: string;
    rating_people: string;
  }>;
}

// IMDb 评分类型定义
export interface IMDBRating {
  rating: string;
  rating_people: string;
}

// Letterboxd 评分类型定义
export interface LetterboxdRating {
  rating: string;
  rating_count: string;
  status: string;
}

// Rotten Tomatoes 评分类型定义
export interface RottenTomatoesRating {
  series: {
    tomatometer: string;
    audience_score: string;
    critics_avg: string;
    critics_count: string;
    audience_count: string;
    audience_avg: string;
  };
  seasons: Array<{
    season_number: number;
    tomatometer: string;
    audience_score: string;
    critics_avg: string;
    critics_count: string;
    audience_count: string;
    audience_avg: string;
  }>;
}

// Metacritic 评分类型定义
export interface MetacriticRating {
  overall: {
    metascore: string;
    critics_count: string;
    userscore: string;
    users_count: string;
  };
  seasons: Array<{
    season_number: number;
    metascore: string;
    critics_count: string;
    userscore: string;
    users_count: string;
  }>;
}

// 添加 Season 类型定义
export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string;
  poster?: string;
}

// 更新评分组件的 Props 类型
export interface TVShowRatingGridProps {
  ratingData: TVShowRatingData;
  selectedSeason?: number;
  className?: string;
  isLoading?: boolean;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  onRetry: () => void;
}

export interface MovieRatingGridProps {
  ratingData: MovieRatingData;
  className?: string;
  isLoading?: boolean;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  onRetry: () => void;
}

export interface SeasonRatingsProps {
  seasons: Season[];
  ratingData: TVShowRatingData;
  error?: {
    status: FetchStatus;
    detail: string;
  };
  onRetry: (platform: string) => void;
}

export function calculateOverallRating(ratingData: any) {
  const ratings = [];
  
  // TMDB评分 (10分制)
  if (ratingData.tmdb?.rating && ratingData.tmdb.rating > 0) {
    ratings.push(Number(ratingData.tmdb.rating));
  }
  
  // Trakt评分 (10分制)
  if (ratingData.trakt?.rating && ratingData.trakt.rating > 0) {
    ratings.push(Number(ratingData.trakt.rating));
  }

  // 计算平均分
  if (ratings.length > 0) {
    return ratings.reduce((a, b) => a + b) / ratings.length;
  }
  
  return null;
}

export interface CalculatedRating {
  rating: number | null;
  validRatings: number;
  platforms: string[];
  hasNewData?: boolean;
}

// RT 系列数据类型
export interface RTSeriesData {
  tomatometer: string;
  audience_score: string;
  critics_avg: string;
  critics_count: string;
  audience_count: string;
  audience_avg: string;
}

// RT TV Show 评分类型
export interface RTTVShowRating {
  series: RTSeriesData;
  seasons: (RTSeriesData & { season_number: number; })[];
}

// MC 整体数据类型
export interface MCOverallData {
  metascore: string;
  critics_count: string;
  userscore: string;
  users_count: string;
}

// MC TV Show 评分类型
export interface MCTVShowRating {
  overall: MCOverallData;
  seasons: (MCOverallData & { season_number: number; })[];
}

// TV Show 评分数据类型
export interface TVShowRatingData {
  douban?: DoubanRating;
  imdb?: IMDBRating;
  rottentomatoes?: {
    series?: {
      tomatometer: string;
      audience_score: string;
      critics_avg: string;
      audience_avg: string;
      critics_count: string;
      audience_count: string;
    };
    seasons?: {
      season_number: number;
      tomatometer: string;
      audience_score: string;
      critics_avg: string;
      audience_avg: string;
      critics_count: string;
      audience_count: string;
    }[];
  };
  metacritic?: {
    overall?: {
      metascore: string;
      userscore: string;
      critics_count: string;
      users_count: string;
    };
    seasons?: {
      season_number: number;
      metascore: string;
      userscore: string;
      critics_count: string;
      users_count: string;
    }[];
  };
  tmdb?: TMDBRating;
  trakt?: {
    rating: number;
    votes: number;
    seasons?: {
      season_number: number;
      rating: number;
      votes: number;
      voteCount?: number;
      distribution?: any;
    }[];
  };
  letterboxd?: {
    status: string;
    rating: string;
    rating_count: string;
  };
}

export interface RTRating {
  series: RTSeriesData;
  seasons: Array<RTSeriesData & { season_number: number; }>;
}