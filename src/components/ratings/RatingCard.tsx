// ==========================================
// 评分卡片组件
// ==========================================
import { StarRating } from './StarRating';
import { getCriticLogo, getAudienceLogo } from '../../utils/rottenTomatoesLogos';

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

export interface RottenTomatoesCardProps {
  criticScore?: number;
  audienceScore?: number;
  criticReviews?: string;
  audienceReviews?: string;
  criticAvg?: string;
  audienceAvg?: string;
  url?: string | null;
  className?: string;
  size?: 'default' | 'compact';
}

export function RottenTomatoesCard({
  criticScore,
  audienceScore,
  criticReviews,
  audienceReviews,
  criticAvg,
  audienceAvg,
  url,
  className = '',
  size = 'default'
}: RottenTomatoesCardProps) {
  const formatCriticAvg = (avg: string | undefined) => {
    if (!avg || avg === '暂无' || avg === '0') return null;
    const match = avg.match(/(\d+\.\d+)/);
    if (match) {
      return `${Number(match[1]).toFixed(2)}/10`;
    }
    return null;
  };

  const formatAudienceAvg = (avg: string | undefined) => {
    if (!avg || avg === '暂无' || avg === '0') return null;
    const match = avg.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      return `${Number(match[1]).toFixed(1)}/5`;
    }
    return null;
  };

  const formatReviewCount = (count: string | undefined, isCritic: boolean) => {
    if (!count || count === '暂无' || count === '0') return null;
    const cleanCount = count.replace(/ Reviews| Ratings/g, '');
    return isCritic ? `${cleanCount} 个专业评价` : `${cleanCount}人评分`;
  };

  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const isCompact = size === 'compact';

  return (
    <div 
      className={`glass-card text-white rounded-lg ${isCompact ? 'p-4' : 'p-6'} h-full ${url ? 'cursor-pointer transition-all' : ''} ${className}`}
      onClick={handleClick}
      role={url ? 'button' : undefined}
      tabIndex={url ? 0 : undefined}
      onKeyPress={(e) => {
        if (url && (e.key === 'Enter' || e.key === ' ')) {
          handleClick();
        }
      }}
    >
      <div className={`flex flex-col ${isCompact ? 'gap-4' : 'gap-6'}`}>
        {/* 专业评分 */}
        {criticScore && criticScore > 0 && (
          <div className={`flex items-start ${isCompact ? 'gap-3' : 'gap-4'}`}>
            <img 
              src={getCriticLogo(criticScore)}
              alt="" 
              className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} object-contain flex-shrink-0`} 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-bold leading-none`}>
                  {`${criticScore}%`}
                </span>
                <div className="flex flex-col">
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400`}>专业新鲜度</span>
                  {criticReviews && (
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                      {formatReviewCount(criticReviews, true)}
                    </span>
                  )}
                  {formatCriticAvg(criticAvg) && (
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                      平均新鲜度 {formatCriticAvg(criticAvg)!}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 观众评分 */}
        {audienceScore && audienceScore > 0 && (
          <div className={`flex items-start ${isCompact ? 'gap-3' : 'gap-4'}`}>
            <img 
              src={getAudienceLogo(audienceScore)}
              alt="" 
              className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} object-contain flex-shrink-0`} 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-bold leading-none`}>
                  {`${audienceScore}%`}
                </span>
                <div className="flex flex-col">
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400`}>观众评分</span>
                  {audienceReviews && (
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                      {formatReviewCount(audienceReviews, false)}
                    </span>
                  )}
                  {formatAudienceAvg(audienceAvg) && (
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                      平均评分 {formatAudienceAvg(audienceAvg)!}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
