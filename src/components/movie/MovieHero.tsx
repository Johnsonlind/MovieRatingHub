// ==========================================
// 电影详情页的头部组件
// ==========================================
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Movie } from '../../types/media';
import type { MovieRatingData } from '../../types/ratings';
import { OverviewModal } from '../../utils/OverviewModal';

interface MovieHeroProps {
  movie: Movie;
  backdropUrl: string;
  ratingData: MovieRatingData;
}

export function MovieHero({ movie, backdropUrl, ratingData }: MovieHeroProps) {
  const [showOverview, setShowOverview] = useState(false);

  console.log('MovieHero ratingData:', ratingData);

  return (
    <>
      <div className="relative min-h-[45vh] sm:min-h-[60vh] overflow-hidden">
        {/* 背景图片 */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-sm"
          style={{ 
            backgroundImage: `url(${backdropUrl || movie.poster})`,
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </div>

        {/* 内容 */}
        <div className="container mx-auto px-4 py-4 sm:py-8 relative content-container">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 items-start">
            {/* 海报 */}
            <div className="w-28 sm:w-40 md:w-48 lg:w-56 mx-auto sm:mx-0 flex-shrink-0 relative z-10">
              <img
                src={movie.poster}
                alt={movie.title}
                className="w-full rounded-lg shadow-xl border border-white/10 responsive-img"
              />
            </div>

            {/* 信息 */}
            <div className="flex-1 relative z-10 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2 text-protection">
                {movie.title} <span className="text-gray-300">({movie.year})</span>
              </h1>

              {/* 移动端概览预览 */}
              <div className="sm:hidden">
                <p className="text-sm text-gray-200 leading-relaxed line-clamp-3 text-protection">
                  {movie.overview}
                </p>
                <button
                  onClick={() => setShowOverview(true)}
                  className="mt-2 text-blue-400 flex items-center gap-1 mx-auto touch-target"
                >
                  查看更多 <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* 桌面概览 */}
              <p className="hidden sm:block text-sm md:text-base lg:text-lg text-gray-200 leading-relaxed max-h-[150px] overflow-y-auto scroll-protection text-protection">
                {movie.overview}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 概览模态框 */}
      <OverviewModal
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        overview={movie.overview}
        title={movie.title}
      />
    </>
  );
}