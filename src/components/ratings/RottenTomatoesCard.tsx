import React from 'react';
import { cn } from '../../lib/utils';

interface RottenTomatoesCardProps {
  criticScore: number | null;
  audienceScore: number | null;
  criticReviews: number | null;
  audienceReviews: number | null;
}

export function RottenTomatoesCard({
  criticScore,
  audienceScore,
  criticReviews,
  audienceReviews,
}: RottenTomatoesCardProps) {
  return (
    <div className="bg-[#15191E] text-white rounded-lg p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <img src="/logos/rottentomatoes_critics.png" alt="" className="w-8 h-8 object-contain" />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{criticScore || 'N/A'}</span>
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">专业评分</span>
                <span className="text-sm text-gray-400">
                  {criticReviews ? `${criticReviews} Ratings 6.30/10` : 'No ratings'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <img src="/logos/rottentomatoes_audience.png" alt="" className="w-8 h-8 object-contain" />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{audienceScore || 'N/A'}</span>
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">观众评分</span>
                <span className="text-sm text-gray-400">
                  {audienceReviews ? `250,000+ Ratings 4/5` : 'No ratings'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}