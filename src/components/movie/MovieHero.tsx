// ==========================================
// 电影 Hero 组件
// ==========================================
import { MediaHero } from '../common/MediaHero';
import type { Movie } from '../../types/media';
import type { MovieRatingData } from '../../types/ratings';

interface MovieHeroProps {
  movie: Movie;
  backdropUrl: string;
  ratingData?: MovieRatingData;
}

export function MovieHero({ movie, backdropUrl }: MovieHeroProps) {
  return <MediaHero media={movie} backdropUrl={backdropUrl} />;
}
