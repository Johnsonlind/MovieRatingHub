// ==========================================
// 评分卡片组件 - 通用评分卡片（豆瓣、IMDB、TMDB、Trakt、Letterboxd）
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
  url?: string | null;  // 添加URL属性
}

export function RatingCard({
  logo,
  rating,
  maxRating,
  label,
  showStars = false,
  className = '',
  url
}: RatingCardProps) {
  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`bg-[#15191E] text-white rounded-lg p-6 ${url ? 'cursor-pointer hover:bg-[#1d2329] transition-colors' : ''} ${className}`}
      onClick={handleClick}
      role={url ? 'button' : undefined}
      tabIndex={url ? 0 : undefined}
      onKeyPress={(e) => {
        if (url && (e.key === 'Enter' || e.key === ' ')) {
          handleClick();
        }
      }}
    >
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