// ==========================================
// 剧集 Hero 组件
// ==========================================
import { MediaHero } from '../common/MediaHero';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';

interface TVShowHeroProps {
  tvShow: TVShow;
  backdropUrl?: string;
  ratingData?: TVShowRatingData;
  isAllDataFetched?: boolean;
}

export function TVShowHero({ tvShow, backdropUrl }: TVShowHeroProps) {
  return <MediaHero media={tvShow} backdropUrl={backdropUrl} />;
} 
