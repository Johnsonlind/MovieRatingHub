import { Star } from 'lucide-react';
import { formatRating } from '../lib/utils';

interface RatingPlatformCardProps {
  platform: string;
  rating: number | null;
  reviewCount?: number;
  logo: string;
  url: string;
  maxRating?: number;
}

export function RatingPlatformCard({
  platform,
  rating,
  reviewCount,
  logo,
  url,
  maxRating = 10,
}: RatingPlatformCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow flex items-center gap-4"
    >
      <img src={logo} alt={platform} className="w-8 h-8 object-contain" />
      
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{formatRating(rating)}</span>
          {rating && (
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < (rating / maxRating) * 5
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        {reviewCount && (
          <p className="text-sm text-gray-600">{reviewCount.toLocaleString()} reviews</p>
        )}
      </div>
    </a>
  );
}