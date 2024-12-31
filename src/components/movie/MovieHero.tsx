import React, { useState } from 'react';
import { Star, ChevronDown } from 'lucide-react';
import { Movie } from '../../types/movie';
import { calculateAverageRating, formatRating } from '../../lib/utils';
import { OverviewModal } from './OverviewModal';

interface MovieHeroProps {
  movie: Movie;
  backdropUrl?: string;
}

export function MovieHero({ movie, backdropUrl }: MovieHeroProps) {
  const [showOverview, setShowOverview] = useState(false);
  const averageRating = calculateAverageRating(movie.ratings);

  return (
    <>
      <div className="relative min-h-[45vh] sm:min-h-[60vh]">
        {/* Backdrop Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-sm"
          style={{ 
            backgroundImage: `url(${backdropUrl || movie.poster})`,
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </div>

        {/* Content */}
        <div className="container mx-auto px-4 py-4 sm:py-8 relative">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 items-start">
            {/* Poster */}
            <div className="w-32 sm:w-48 lg:w-64 mx-auto sm:mx-0 flex-shrink-0 relative z-10">
              <img
                src={movie.poster}
                alt={movie.title}
                className="w-full rounded-lg shadow-xl border border-white/10"
              />
            </div>

            {/* Info */}
            <div className="flex-1 relative z-10 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
                {movie.title} <span className="text-gray-300">({movie.year})</span>
              </h1>
              
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-4">
                {averageRating > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                    <span className="text-lg sm:text-xl font-semibold text-white">
                      {formatRating(averageRating)}
                    </span>
                  </div>
                )}
              </div>

              {/* Mobile Overview Preview */}
              <div className="sm:hidden">
                <p className="text-sm text-gray-200 leading-relaxed line-clamp-3">
                  {movie.overview}
                </p>
                <button
                  onClick={() => setShowOverview(true)}
                  className="mt-2 text-blue-400 flex items-center gap-1 mx-auto"
                >
                  查看更多 <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Desktop Overview */}
              <p className="hidden sm:block text-base lg:text-lg text-gray-200 leading-relaxed">
                {movie.overview}
              </p>
            </div>
          </div>
        </div>
      </div>

      <OverviewModal
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        overview={movie.overview}
        title={movie.title}
      />
    </>
  );
}