// ==========================================
// 平台URL生成工具 - 根据媒体信息生成各平台的评分页面URL
// ==========================================

interface MediaInfo {
  id?: number;  // TMDB ID
  imdbId?: string;
  title?: string;
  originalTitle?: string;
  year?: number;
  type?: 'movie' | 'tv';
}

/**
 * 生成豆瓣评分页面URL
 * 注意：豆瓣需要豆瓣ID，这里只能返回搜索页面
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
  // 如果没有IMDb ID，返回搜索页面
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
  
  // Letterboxd 使用 slug 格式，但我们可以用IMDb ID直接跳转
  if (media.imdbId) {
    return `https://letterboxd.com/imdb/${media.imdbId}/`;
  }
  
  // 否则返回搜索页面
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
  if (!media.title && !media.originalTitle) return null;
  
  // 构建Trakt详情页URL，使用slug格式
  const mediaType = media.type === 'tv' ? 'shows' : 'movies';
  // 优先使用英文原标题，因为中文标题会被正则移除
  const title = media.originalTitle || media.title || '';
  
  let slug = title.toLowerCase()
    .replace(/[^\w\s-]/g, '') // 移除特殊字符
    .replace(/\s+/g, '-')     // 空格替换为-
    .replace(/--+/g, '-')     // 多个-替换为单个-
    .trim();
  
  // 对于电影，在slug后面添加年份
  if (media.type === 'movie' && media.year) {
    slug = `${slug}-${media.year}`;
  }
  
  return `https://trakt.tv/${mediaType}/${slug}`;
}
