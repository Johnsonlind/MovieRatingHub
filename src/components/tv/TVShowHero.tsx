import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';
import { OverviewModal } from '../movie/OverviewModal';

interface TVShowHeroProps {
  tvShow: TVShow;
  backdropUrl?: string;
  ratingData?: TVShowRatingData;
  isAllDataFetched: boolean;
}

export function TVShowHero({ tvShow, backdropUrl, ratingData, isAllDataFetched }: TVShowHeroProps) {
  const [showOverview, setShowOverview] = useState(false);
  
  console.log('TVShowHero props:', {
    tvShow,
    backdropUrl,
    ratingData,
    isAllDataFetched
  });

  return (
    <>
      <div className="relative min-h-[45vh] sm:min-h-[60vh]">
        {/* Backdrop Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-sm"
          style={{ 
            backgroundImage: `url(${backdropUrl || tvShow.poster})`,
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
                src={tvShow.poster}
                alt={tvShow.title}
                className="w-full rounded-lg shadow-xl border border-white/10"
              />
            </div>

            {/* Info */}
            <div className="flex-1 relative z-10 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
                {tvShow.title} <span className="text-gray-300">({tvShow.year})</span>
              </h1>

              {/* Mobile Overview Preview */}
              <div className="sm:hidden">
                <p className="text-sm text-gray-200 leading-relaxed line-clamp-3">
                  {tvShow.overview}
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
                {tvShow.overview}
              </p>
            </div>
          </div>
        </div>
      </div>

      <OverviewModal
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        overview={tvShow.overview}
        title={tvShow.title}
      />
    </>
  );
} 