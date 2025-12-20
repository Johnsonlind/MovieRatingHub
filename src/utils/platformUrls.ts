// ==========================================
// 平台URL生成工具
// ==========================================
interface MediaInfo {
  id?: number;
  imdbId?: string;
  title?: string;
  originalTitle?: string;
  enTitle?: string;
  year?: number;
  type?: 'movie' | 'tv';
}

/**
 * 生成豆瓣评分页面URL
 */
export function getDoubanUrl(media: MediaInfo): string | null {
  if (!media.title && !media.originalTitle) return null;
  const searchTitle = encodeURIComponent(media.title || media.originalTitle || '');
  return `https://search.douban.com/movie/subject_search?search_text=${searchTitle}`;
}

/**
 * 生成IMDb评分页面URL
 */
export function getImdbUrl(media: MediaInfo): string | null {
  if (media.imdbId) {
    return `https://www.imdb.com/title/${media.imdbId}/`;
  }
  if (media.title || media.originalTitle) {
    const searchTitle = encodeURIComponent(media.title || media.originalTitle || '');
    return `https://www.imdb.com/find/?q=${searchTitle}`;
  }
  return null;
}

/**
 * 生成Letterboxd评分页面URL
 */
export function getLetterboxdUrl(media: MediaInfo): string | null {
  if (!media.title && !media.originalTitle && !media.imdbId) return null;
  
  if (media.imdbId) {
    return `https://letterboxd.com/imdb/${media.imdbId}/`;
  }
  
  const searchTitle = encodeURIComponent(media.title || media.originalTitle || '');
  return `https://letterboxd.com/search/${searchTitle}/`;
}

/**
 * 生成Rotten Tomatoes评分页面URL
 */
export function getRottenTomatoesUrl(media: MediaInfo): string | null {
  if (!media.title && !media.originalTitle) return null;
  
  const searchTitle = encodeURIComponent(media.title || media.originalTitle || '');
  return `https://www.rottentomatoes.com/search?search=${searchTitle}`;
}

/**
 * 生成Metacritic评分页面URL
 */
export function getMetacriticUrl(media: MediaInfo): string | null {
  if (!media.title && !media.originalTitle) return null;
  
  const searchTitle = encodeURIComponent(media.title || media.originalTitle || '');
  return `https://www.metacritic.com/search/${searchTitle}/`;
}

/**
 * 生成TMDB评分页面URL
 */
export function getTmdbUrl(media: MediaInfo): string | null {
  if (!media.id) return null;
  
  const mediaType = media.type === 'tv' ? 'tv' : 'movie';
  return `https://www.themoviedb.org/${mediaType}/${media.id}`;
}

/**
 * 生成Trakt评分页面URL
 */
export function getTraktUrl(media: MediaInfo): string | null {
  if (!media.title && !media.originalTitle && !media.enTitle) return null;
  
  const mediaType = media.type === 'tv' ? 'shows' : 'movies';
  const title = media.enTitle || media.originalTitle || media.title || '';
  
  let slug = title.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
  
  if (media.type === 'movie' && media.year) {
    slug = `${slug}-${media.year}`;
  }
  
  return `https://trakt.tv/${mediaType}/${slug}`;
}
