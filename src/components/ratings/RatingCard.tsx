import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

interface RatingCardProps {
  logo: string;
  rating: number;
  maxRating: number;
  reviewCount?: number;
  className?: string;
  showStars?: boolean;
  label?: string;
}

export function RatingCard({
  logo,
  rating,
  maxRating,
  reviewCount,
  className,
  showStars = false,
  label,
}: RatingCardProps) {
  const stars = Math.round((rating / maxRating) * 5);

  return (
    <div className={cn(
      "bg-[#15191E] text-white rounded-lg p-4 flex items-center gap-4",
      className
    )}>
      <img src={logo} alt="" className="w-8 h-8 object-contain" />
      
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{rating}</span>
          {label && (
            <div className="flex flex-col">
              <span className="text-sm text-gray-400">{label}</span>
            </div>
          )}
        </div>
        
        {showStars && (
          <div className="flex gap-0.5 mt-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "w-4 h-4",
                  i < stars ? "text-yellow-400 fill-yellow-400" : "text-gray-600"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}