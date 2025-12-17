// ==========================================
// 综合评分卡片组件 - 显示基于多平台的加权综合评分
// ==========================================
interface OverallRatingCardProps {
  rating: number;
  validPlatformsCount: number;
  seasonNumber?: number;
}

export function OverallRatingCard({ rating, validPlatformsCount }: OverallRatingCardProps) {
  return (
    <div className="w-28">
      <div className="relative overall-rating-gradient rounded-xl flex flex-col items-center justify-center min-h-[70px]">
        <div className="text-[30px] font-bold text-white drop-shadow-lg">
          {rating.toFixed(1)}
        </div>
        <div className="text-[9px] text-white/90 mt-1 drop-shadow-md whitespace-nowrap">
          基于{validPlatformsCount}个平台的加权计算
        </div>
      </div>
    </div>
  );
}