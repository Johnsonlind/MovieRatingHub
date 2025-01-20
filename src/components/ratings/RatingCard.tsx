import { StarRating } from './StarRating';

interface RatingCardProps {
  logo: string;
  rating: number;
  maxRating: number;
  label?: string;
  showStars?: boolean;
  distribution?: {
    [key: string]: number;
  };
  className?: string;
}

export function RatingCard({
  logo,
  rating,
  maxRating,
  label,
  showStars = false,
  className = ''
}: RatingCardProps) {
  return (
    <div className={`bg-[#15191E] text-white rounded-lg p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <img src={logo} alt="" className="w-10 h-10 object-contain flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-start">
            <span className="text-4xl font-bold leading-none">
              {typeof rating === 'string' ? rating : rating.toFixed(1)}
            </span>
          </div>
          {label && (
            <div className="text-sm text-gray-400 mt-1">
              {label}
            </div>
          )}
          {showStars && typeof rating === 'number' && (
            <div className="mt-2">
              <StarRating rating={rating} maxRating={maxRating} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}