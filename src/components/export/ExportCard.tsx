import React from 'react';
import type { Media } from '../../types/media';

interface ExportCardProps {
  media: Media;
  title: string;
  children: React.ReactNode;
}

export function ExportCard({ media, title, children }: ExportCardProps) {
  const season = media.type === 'tv' && media.selectedSeason 
    ? media.seasons?.find(s => s.seasonNumber === media.selectedSeason)
    : null;
  
  const posterUrl = season?.poster || media.poster;

  return (
    <div className="bg-white p-8 w-[1200px] min-h-[800px] flex">
      {/* 左侧海报容器 */}
      <div className="w-[300px] flex items-center">
        <div className="w-[300px] h-[450px] flex-shrink-0 bg-gray-100">
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-contain rounded-lg shadow-lg"
            crossOrigin="anonymous"
            loading="eager"
          />
        </div>
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 ml-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            {title}
            <span className="text-gray-500">({media.year})</span>
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}