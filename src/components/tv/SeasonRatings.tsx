import React from 'react';
import { RatingGrid } from '../ratings/RatingGrid';
import type { TVShow } from '../../types/media';

interface SeasonRatingsProps {
  seasons: TVShow['seasons'];
}

export function SeasonRatings({ seasons }: SeasonRatingsProps) {
  if (!seasons?.length) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">分季评分</h2>
      <div className="space-y-8">
        {seasons.map((season) => (
          <div key={season.seasonNumber} className="bg-white rounded-lg shadow p-6">
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-1">
                第 {season.seasonNumber} 季：{season.name}
              </h3>
              <div className="text-sm text-gray-500">
                <span>{season.episodeCount} 集</span>
                <span className="mx-2">•</span>
                <span>首播：{new Date(season.airDate).getFullYear()}</span>
              </div>
            </div>
            <RatingGrid media={season} className="bg-gray-50 p-4 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
} 