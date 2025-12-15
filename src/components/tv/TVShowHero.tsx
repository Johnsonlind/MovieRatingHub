// ==========================================
// 电视剧Hero组件 - 显示剧集海报、标题和简介
// ==========================================
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';
import { OverviewModal } from '../../utils/OverviewModal';

interface TVShowHeroProps {
  tvShow: TVShow;
  backdropUrl?: string;
  ratingData?: TVShowRatingData;
  isAllDataFetched: boolean;
}

export function TVShowHero({ tvShow, backdropUrl }: TVShowHeroProps) {
  const [showOverview, setShowOverview] = useState(false);

  return (
    <>
      <div className="relative min-h-[45vh] sm:min-h-[60vh]">
        {/* 背景图片 */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-sm -mt-16"
          style={{ 
            backgroundImage: `url(${backdropUrl || tvShow.poster})`,
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </div>

        {/* 内容 */}
        <div className="container mx-auto px-4 py-4 sm:py-8 relative">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 items-start">
            {/* 海报 */}
            <div className="w-32 sm:w-48 lg:w-64 mx-auto sm:mx-0 flex-shrink-0 relative z-10">
              <img
                src={tvShow.poster}
                alt={tvShow.title}
                className="w-full rounded-lg shadow-xl border border-white/10"
              />
            </div>

            {/* 信息 */}
            <div className="flex-1 relative z-10 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2 drop-shadow-lg">
                {tvShow.title} <span className="text-gray-200">({tvShow.year})</span>
              </h1>

              {/* 移动端概览预览 */}
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

              {/* 桌面概览 */}
              <p className="hidden sm:block text-base lg:text-lg text-gray-200 leading-relaxed">
                {tvShow.overview}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 概览模态框 */}
      <OverviewModal
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        overview={tvShow.overview}
        title={tvShow.title}
      />
    </>
  );
} 