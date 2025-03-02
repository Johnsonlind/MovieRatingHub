// ==========================================
// TMDB API 索引
// ==========================================
import { searchMovies } from './movies';
import { searchTVShows } from './tv';
export { getMovie } from './movies';
export { getTVShow } from './tv';

interface SearchParams {
  page?: number;
}

export async function searchMedia(
  query: string,
  { page = 1 }: SearchParams = {}
) {
  const [movies, tvShows] = await Promise.all([
    searchMovies(query, page),
    searchTVShows(query, page),
  ]);

  return { movies, tvShows };
}