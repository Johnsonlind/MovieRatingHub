import React from 'react';
import type { Media } from '../../types/media';

interface ExportCardProps {
  media: Media;
  title: string;
  children: React.ReactNode;
}

export function ExportCard({ media, title, children }: ExportCardProps) {
  const season = 'seasons' in media && media.selectedSeason 
    ? media.seasons?.find(s => s.seasonNumber === media.selectedSeason)
    : null;
  
  const posterUrl = season?.poster || media.poster;

  return (
    <div className="bg-white p-8 rounded-3xl shadow-lg w-[1200px] flex gap-8">
      {/* Poster Container */}
      <div className="w-[400px] h-[600px] flex-shrink-0 relative">
        <img
          src={posterUrl}
          alt={title}
          className="w-full h-full object-cover rounded-2xl shadow-md"
          crossOrigin="anonymous"
          loading="eager"
          style={{
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 pl-8 border-l border-gray-100">
        <div className="flex items-baseline gap-2 mb-8">
          <h1 className="text-4xl font-bold">{title}</h1>
          <span className="text-xl text-gray-500">({media.year})</span>
        </div>
        {children}
      </div>
    </div>
  );
}