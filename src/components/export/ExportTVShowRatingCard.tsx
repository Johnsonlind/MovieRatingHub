import React from 'react';
import type { TVShow } from '../../types/media';
import { ExportCard } from './ExportCard';
import { RatingPlatformItem } from './RatingPlatformItem';

interface ExportTVShowRatingCardProps {
  tvShow: TVShow;
  selectedSeason?: number | null;
}

export function ExportTVShowRatingCard({ tvShow, selectedSeason }: ExportTVShowRatingCardProps) {
  // Use sample data for demonstration
  const sampleRatings = {
    douban: 9.1,
    imdb: 9.2,
    rottenTomatoes: {
      critic: 91,
      audience: 98
    },
    metacritic: {
      critic: 92,
      user: 9.1
    },
    letterboxd: 4.5
  };

  const title = selectedSeason 
    ? `${tvShow.title} 第${selectedSeason}季` 
    : tvShow.title;

  return (
    <ExportCard media={tvShow} title={title}>
      <div className="space-y-6">
        {/* 豆瓣 */}
        <RatingPlatformItem
          logo="/logos/douban.png"
          rating={sampleRatings.douban}
          reviewCount="156,789 人评分"
        />

        {/* IMDb */}
        <RatingPlatformItem
          logo="/logos/imdb.png"
          rating={sampleRatings.imdb}
          reviewCount="312,394 人评分"
        />

        {/* Rotten Tomatoes */}
        <div className="flex items-center gap-4">
          <RatingPlatformItem
            logo="/logos/rottentomatoes_critics.png"
            rating={sampleRatings.rottenTomatoes.critic}
            showPercentage
            reviewCount="156 Reviews"
            additionalInfo="8.8/10"
          />
          <RatingPlatformItem
            logo="/logos/rottentomatoes_audience.png"
            rating={sampleRatings.rottenTomatoes.audience}
            showPercentage
            reviewCount="100+ Verified Ratings"
            additionalInfo="4.5/5"
            className="ml-8"
          />
        </div>

        {/* Metacritic */}
        <div className="flex items-center gap-12">
          <RatingPlatformItem
            logo="/logos/metacritic.png"
            rating={sampleRatings.metacritic.critic}
            showPercentage
            additionalInfo="Based on 28 Critic Reviews"
          />
          <RatingPlatformItem
            rating={sampleRatings.metacritic.user}
            logo="/logos/metacritic.png"
            additionalInfo="Based on 90 User Ratings"
          />
        </div>

        {/* Letterboxd */}
        <RatingPlatformItem
          logo="/logos/letterboxd.png"
          rating={sampleRatings.letterboxd}
          maxStars={5}
          reviewCount="23 Ratings"
        />
      </div>
    </ExportCard>
  );
}