// ==========================================
// 评分卡片组件
// ==========================================
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
  url?: string | null;
  size?: 'default' | 'compact';
}

export function RatingCard({
  logo,
  rating,
  maxRating,
  label,
  showStars = false,
  className = '',
  url,
  size = 'default'
}: RatingCardProps) {
  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const isCompact = size === 'compact';

  return (
    <div 
      className={`glass-card text-white rounded-lg ${isCompact ? 'p-4' : 'p-6'} ${url ? 'cursor-pointer transition-all' : ''} ${className}`}
      onClick={handleClick}
      role={url ? 'button' : undefined}
      tabIndex={url ? 0 : undefined}
      onKeyPress={(e) => {
        if (url && (e.key === 'Enter' || e.key === ' ')) {
          handleClick();
        }
      }}
    >
      <div className={`flex items-start ${isCompact ? 'gap-3' : 'gap-4'}`}>
        <img src={logo} alt="" className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} object-contain flex-shrink-0`} />
        <div className="flex-1">
          <div className="flex items-start">
            <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-bold leading-none`}>
              {typeof rating === 'string' ? rating : rating.toFixed(1)}
            </span>
          </div>
          {label && (
            <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
              {label}
            </div>
          )}
          {showStars && typeof rating === 'number' && (
            <div className={isCompact ? 'mt-1.5' : 'mt-2'}>
              <StarRating rating={rating} maxRating={maxRating} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
