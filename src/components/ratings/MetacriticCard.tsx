// ==========================================
// Metacritic评分卡片组件 - 显示专业Metascore和用户评分
// ==========================================
interface MetacriticCardProps {
  metascore?: number;
  userScore?: number;
  criticReviews?: string;
  userReviews?: string;
  url?: string | null;  // 添加URL属性
}

export function MetacriticCard({
  metascore,
  userScore,
  criticReviews,
  userReviews,
  url,
}: MetacriticCardProps) {
  // 处理评分人数
  const formatReviewCount = (count: string | undefined, isCritic: boolean) => {
    if (!count || count === '暂无') return '暂无数据';
    return isCritic ? `${count} 个专业评价` : `${count} 人评分`;
  };

  // 格式化用户评分，保留一位小数
  const formatUserScore = (score: number | undefined) => {
    if (!score) return 'N/A';
    return score.toFixed(1);
  };

  // 如果两个评分都没有，不显示组件
  if (!metascore && !userScore) {
    return null;
  }

  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`glass-card text-white rounded-lg p-6 h-full ${url ? 'cursor-pointer hover:scale-105 transition-all' : ''}`}
      onClick={handleClick}
      role={url ? 'button' : undefined}
      tabIndex={url ? 0 : undefined}
      onKeyPress={(e) => {
        if (url && (e.key === 'Enter' || e.key === ' ')) {
          handleClick();
        }
      }}
    >
      <div className="flex flex-col gap-6">
        {/* 专业评分 */}
        {typeof metascore === 'number' && metascore > 0 && (
          <div className="flex items-start gap-4">
            <img 
              src={`/logos/metacritic.png`}
              alt="" 
              className="w-10 h-10 object-contain flex-shrink-0" 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className="text-4xl font-bold leading-none">
                  {metascore}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">专业评分</span>
                  {criticReviews && (
                    <span className="text-sm text-gray-400 mt-1">
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
          <div className="flex items-start gap-4">
            <img 
              src={`/logos/metacritic_audience.png`}
              alt="" 
              className="w-10 h-10 object-contain flex-shrink-0" 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className="text-4xl font-bold leading-none">
                  {formatUserScore(userScore)}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">用户评分</span>
                  {userReviews && (
                    <span className="text-sm text-gray-400 mt-1">
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