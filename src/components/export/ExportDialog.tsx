import { ExportTVShowRatingCard } from './ExportTVShowRatingCard';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';

interface ExportDialogProps {
  tvShow: TVShow;
  ratingData: TVShowRatingData;
  selectedSeason?: number;
}

export function ExportDialog({ tvShow, ratingData, selectedSeason }: ExportDialogProps) {
  return (
    <ExportTVShowRatingCard 
      tvShow={tvShow}
      ratingData={ratingData} 
      selectedSeason={selectedSeason}
    />
  );
}