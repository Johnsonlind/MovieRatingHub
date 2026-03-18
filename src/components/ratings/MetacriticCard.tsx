// ==========================================
// Metacritic 评分卡片组件
// ==========================================
interface MetacriticCardProps {
  metascore?: number;
  userScore?: number;
  criticReviews?: string;
  userReviews?: string;
  url?: string | null;
  className?: string;
  size?: 'default' | 'compact';
}

export function MetacriticCard({
  metascore,
  userScore,
  criticReviews,
  userReviews,
  url,
  className = '',
  size = 'default'
}: MetacriticCardProps) {
  const formatReviewCount = (count: string | undefined, isCritic: boolean) => {
    if (!count || count === '暂无') return '暂无数据';
    return isCritic ? `${count} 个专业评价` : `${count} 人评分`;
  };

  const formatUserScore = (score: number | undefined) => {
    if (!score) return 'N/A';
    return score.toFixed(1);
  };

  if (!metascore && !userScore) {
    return null;
  }

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
        {typeof metascore === 'number' && metascore > 0 && (
          <div className={`flex items-start ${isCompact ? 'gap-3' : 'gap-4'}`}>
            <img 
              src={`/logos/metacritic.png`}
              alt="" 
              className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} object-contain flex-shrink-0`} 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-bold leading-none`}>
                  {metascore}
                </span>
                <div className="flex flex-col">
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400`}>专业评分</span>
                  {criticReviews && (
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                      {formatReviewCount(criticReviews, true)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 用户评分 */}
        {typeof userScore === 'number' && userScore > 0 && (
          <div className={`flex items-start ${isCompact ? 'gap-3' : 'gap-4'}`}>
            <img 
              src={`/logos/metacritic_audience.png`}
              alt="" 
              className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} object-contain flex-shrink-0`} 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-bold leading-none`}>
                  {formatUserScore(userScore)}
                </span>
                <div className="flex flex-col">
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400`}>用户评分</span>
                  {userReviews && (
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400 mt-1`}>
                      {formatReviewCount(userReviews, false)}
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
