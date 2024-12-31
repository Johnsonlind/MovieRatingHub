import React from 'react';
import { formatDate } from '../../lib/utils';

interface TVShowMetadataProps {
  status?: string;
  firstAirDate?: string;
  lastAirDate?: string;
  genres?: string[];
}

export function TVShowMetadata({ 
  status, 
  firstAirDate, 
  lastAirDate, 
  genres 
}: TVShowMetadataProps) {
  return (
    <div className="container mx-auto px-4 py-4">
      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        {status && (
          <div className="flex items-center gap-2">
            <span className="font-medium">状态:</span>
            <span>{status === 'Ended' ? '已完结' : '连载中'}</span>
          </div>
        )}
        
        {firstAirDate && (
          <div className="flex items-center gap-2">
            <span className="font-medium">首播:</span>
            <span>{formatDate(firstAirDate)}</span>
          </div>
        )}
        
        {lastAirDate && status === 'Ended' && (
          <div className="flex items-center gap-2">
            <span className="font-medium">完结:</span>
            <span>{formatDate(lastAirDate)}</span>
          </div>
        )}
        
        {genres && genres.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-medium">类型:</span>
            <span>{genres.join(' / ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}