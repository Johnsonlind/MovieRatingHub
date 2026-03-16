// ==========================================
// 剧集 Hero 组件
// ==========================================
import type { ReactNode } from 'react';
import { MediaHero } from '../common/MediaHero';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';

interface TVShowHeroProps {
  tvShow: TVShow;
  backdropUrl?: string;
  ratingData?: TVShowRatingData;
  posterBelow?: ReactNode;
  rightPanel?: ReactNode;
  bottomRight?: ReactNode;
  titleRight?: ReactNode;
  isAllDataFetched?: boolean;
}

export function TVShowHero({
  tvShow,
  backdropUrl,
  posterBelow,
  rightPanel,
  bottomRight,
  titleRight
}: TVShowHeroProps) {
  return (
    <MediaHero
      media={tvShow}
      backdropUrl={backdropUrl}
      posterBelow={posterBelow}
      rightPanel={rightPanel}
      bottomRight={bottomRight}
      titleRight={titleRight}
    />
  );
} 
