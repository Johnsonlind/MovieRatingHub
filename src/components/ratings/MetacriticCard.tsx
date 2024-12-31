import React from 'react';
import { cn } from '../../lib/utils';

interface MetacriticCardProps {
  criticScore: number | null;
  userScore: number | null;
  criticReviews: number | null;
  userReviews: number | null;
}

export function MetacriticCard({
  criticScore,
  userScore,
  criticReviews,
  userReviews,
}: MetacriticCardProps) {
  return (
    <div className="bg-[#15191E] text-white rounded-lg p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <img src="/logos/metacritic.png" alt="" className="w-8 h-8 object-contain" />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{criticScore || 'N/A'}</span>
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">专业评分</span>
                <span className="text-sm text-gray-400">
                  {criticReviews ? `${criticReviews} Ratings` : 'No ratings'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <img src="/logos/metacritic.png" alt="" className="w-8 h-8 object-contain" />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{userScore || 'N/A'}</span>
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">用户评分</span>
                <span className="text-sm text-gray-400">
                  {userReviews ? `${userReviews} Ratings` : 'No ratings'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}