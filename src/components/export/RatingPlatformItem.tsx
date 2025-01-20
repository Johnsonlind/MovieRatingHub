import { Star } from 'lucide-react';

interface RatingPlatformItemProps {
  logo: string;
  rating: number;
  reviewCount?: string;
  maxStars?: number;
  showPercentage?: boolean;
  additionalInfo?: string;
  className?: string;
}

export function RatingPlatformItem({
  logo,
  rating,
  reviewCount,
  maxStars = 5,
  showPercentage = false,
  additionalInfo,
  className = '',
}: RatingPlatformItemProps) {
  const formattedRating = showPercentage ? `${rating}%` : rating;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <img src={logo} alt="" className="w-12 h-12 object-contain" />
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{formattedRating}</span>
          {maxStars && !showPercentage && (
            <div className="flex gap-0.5">
              {[...Array(maxStars)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-6 h-6 ${
                    i < Math.floor(rating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        {(reviewCount || additionalInfo) && (
          <p className="text-gray-500 text-sm">
            {reviewCount}
            {reviewCount && additionalInfo && ' • '}
            {additionalInfo}
          </p>
        )}
      </div>
    </div>
  );
}