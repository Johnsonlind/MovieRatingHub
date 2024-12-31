import React from 'react';
import { RatingCard } from './RatingCard';
import { RottenTomatoesCard } from './RottenTomatoesCard';
import { MetacriticCard } from './MetacriticCard';
import type { Movie, TVShow } from '../../types/media';

interface RatingGridProps {
  media: Movie | TVShow;
  className?: string;
}

export function RatingGrid({ media, className }: RatingGridProps) {
  const ratings = media.ratings || {};
  
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 ${className}`}>
      {/* 豆瓣 */}
      <RatingCard
        logo="/logos/douban.png"
        rating={ratings.douban || 0}
        maxRating={10}
        label="156,789 人评分"
        showStars
      />
      
      {/* IMDB */}
      <RatingCard
        logo="/logos/imdb.png"
        rating={ratings.imdb || 0}
        maxRating={10}
        label="312,394 人评分"
        showStars
      />
      
      {/* Rotten Tomatoes */}
      <RottenTomatoesCard
        criticScore={ratings.rottenTomatoes?.critic || 0}
        audienceScore={ratings.rottenTomatoes?.audience || 0}
        criticReviews={156}
        audienceReviews={250000}
        className="sm:col-span-2 lg:col-span-1"
      />
      
      {/* Metacritic */}
      <MetacriticCard
        criticScore={ratings.metacritic?.critic || 0}
        userScore={ratings.metacritic?.user || 0}
        criticReviews={23}
        userReviews={324}
        className="sm:col-span-2 lg:col-span-1"
      />
      
      {/* Letterboxd */}
      <RatingCard
        logo="/logos/letterboxd.png"
        rating={ratings.letterboxd || 0}
        maxRating={5}
        label="23 人评分"
        showStars
      />
    </div>
  );
}