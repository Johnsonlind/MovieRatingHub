import React from 'react';
import { RatingGrid } from '../ratings/RatingGrid';
import type { Movie } from '../../types/media';

interface MovieRatingSectionProps {
  movie: Movie;
}

export function MovieRatingSection({ movie }: MovieRatingSectionProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">评分</h2>
      <RatingGrid media={movie} />
    </div>
  );
} 