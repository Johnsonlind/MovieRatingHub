import React from 'react';
import { RatingGrid } from '../ratings/RatingGrid';
import type { TVShow } from '../../types/media';

interface TVShowRatingSectionProps {
  tvShow: TVShow;
}

export function TVShowRatingSection({ tvShow }: TVShowRatingSectionProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">整体评分</h2>
      <RatingGrid media={tvShow} className="bg-white p-6 rounded-lg shadow" />
    </div>
  );
} 