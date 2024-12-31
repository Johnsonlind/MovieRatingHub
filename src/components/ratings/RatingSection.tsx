import React from 'react';
import { RatingGrid } from './RatingGrid';
import type { Movie, TVShow } from '../../types/media';

interface RatingSectionProps {
  media: Movie | TVShow;
}

export function RatingSection({ media }: RatingSectionProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">评分</h2>
      <RatingGrid media={media} />
    </div>
  );
} 