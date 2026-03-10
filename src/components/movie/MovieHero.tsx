// ==========================================
// 电影 Hero 组件
// ==========================================
import { MediaHero } from '../common/MediaHero';
import type { ReactNode } from 'react';
import type { Movie } from '../../types/media';
import type { MovieRatingData } from '../../types/ratings';

interface MovieHeroProps {
  movie: Movie;
  backdropUrl: string;
  ratingData?: MovieRatingData;
  posterBelow?: ReactNode;
  rightPanel?: ReactNode;
  bottomRight?: ReactNode;
  titleRight?: ReactNode;
}

export function MovieHero({ movie, backdropUrl, posterBelow, rightPanel, bottomRight, titleRight }: MovieHeroProps) {
  return (
    <MediaHero
      media={movie}
      backdropUrl={backdropUrl}
      posterBelow={posterBelow}
      rightPanel={rightPanel}
      bottomRight={bottomRight}
      titleRight={titleRight}
    />
  );
}
