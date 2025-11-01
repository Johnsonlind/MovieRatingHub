// ==========================================
// 烂番茄评分卡片组件 - 显示专业评分和观众评分
// ==========================================
import { getCriticLogo, getAudienceLogo } from '../../utils/rottenTomatoesLogos';

export interface RottenTomatoesCardProps {
  criticScore?: number;
  audienceScore?: number;
  criticReviews?: string;
  audienceReviews?: string;
  criticAvg?: string;
  audienceAvg?: string;
  url?: string | null;  // 添加URL属性
}

export function RottenTomatoesCard({
  criticScore,
  audienceScore,
  criticReviews,
  audienceReviews,
  criticAvg,
  audienceAvg,
  url,
}: RottenTomatoesCardProps) {
  // 处理专业评分平均分
  const formatCriticAvg = (avg: string | undefined) => {
    if (!avg || avg === '暂无') return '暂无数据';
    const match = avg.match(/(\d+\.\d+)/);
    if (match) {
      return `${Number(match[1]).toFixed(2)}/10`;
    }
    return '暂无数据';
  };

  // 处理观众评分平均分
  const formatAudienceAvg = (avg: string | undefined) => {
    if (!avg || avg === '暂无') return '暂无数据';
    // 匹配整数或小数
    const match = avg.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      return `${Number(match[1]).toFixed(1)}/5`;
    }
    return '暂无数据';
  };

  // 处理评分人数
  const formatReviewCount = (count: string | undefined, isCritic: boolean) => {
    if (!count || count === '暂无' || count === '0') return null;
    // 保留 "+" 符号
    const cleanCount = count.replace(/ Reviews| Ratings/g, '');
    return isCritic ? `${cleanCount} 个专业评价` : `${cleanCount}人评分`;
  };

  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`bg-[#15191E] text-white rounded-lg p-6 h-full ${url ? 'cursor-pointer hover:bg-[#1d2329] transition-colors' : ''}`}
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
        {criticScore && criticScore > 0 && (
          <div className="flex items-start gap-4">
            <img 
              src={getCriticLogo(criticScore)}
              alt="" 
              className="w-10 h-10 object-contain flex-shrink-0" 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className="text-4xl font-bold leading-none">
                  {`${criticScore}%`}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">专业新鲜度</span>
                  {criticReviews && (
                    <span className="text-sm text-gray-400 mt-1">
                      {formatReviewCount(criticReviews, true)}
                    </span>
                  )}
                  {criticAvg && (
                    <span className="text-sm text-gray-400 mt-1">
                      平均新鲜度 {formatCriticAvg(criticAvg)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 观众评分 */}
        {audienceScore && audienceScore > 0 && (
          <div className="flex items-start gap-4">
            <img 
              src={getAudienceLogo(audienceScore)}
              alt="" 
              className="w-10 h-10 object-contain flex-shrink-0" 
            />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className="text-4xl font-bold leading-none">
                  {`${audienceScore}%`}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">观众评分</span>
                  {audienceReviews && (
                    <span className="text-sm text-gray-400 mt-1">
                      {formatReviewCount(audienceReviews, false)}
                    </span>
                  )}
                  {audienceAvg && (
                    <span className="text-sm text-gray-400 mt-1">
                      平均评分 {formatAudienceAvg(audienceAvg)}
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