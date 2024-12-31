import React from 'react';
import { Star } from 'lucide-react';
import { formatRating } from '../../lib/utils';

interface RatingPlatformItemProps {
  logo: string;
  rating: number;
  maxStars?: number;
  showPercentage?: boolean;
  reviewCount?: string;
  additionalInfo?: string;
  className?: string;
}

export function RatingPlatformItem({
  logo,
  rating,
  maxStars = 5,
  showPercentage = false,
  reviewCount,
  additionalInfo,
  className = ''
}: RatingPlatformItemProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <img 
        src={logo} 
        alt="" 
        className="w-12 h-12"
        crossOrigin="anonymous"
      />
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">
            {showPercentage ? `${rating}%` : formatRating(rating)}
          </span>
          {!showPercentage && (
            <div className="flex gap-0.5">
              {[...Array(maxStars)].map((_, i) => (
                <Star
                  key={i}
                  className="w-6 h-6 text-yellow-400 fill-yellow-400"
                />
              ))}
            </div>
          )}
        </div>
        {(reviewCount || additionalInfo) && (
          <p className="text-gray-500 text-sm">
            {reviewCount && `${reviewCount} • `}{additionalInfo}
          </p>
        )}
      </div>
    </div>
  );
}