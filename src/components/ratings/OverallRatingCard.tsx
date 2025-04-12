// ==========================================
// 综合评分卡片
// ==========================================
interface OverallRatingCardProps {
  rating: number;
  validPlatformsCount: number;
  seasonNumber?: number;
}

export function OverallRatingCard({ rating, validPlatformsCount }: OverallRatingCardProps) {
  return (
    <div className="w-32">
      <div className="relative">
        <img 
          src="/rating-template.png"
          alt="评分背景"
          className="w-full"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[30px] font-bold text-white">
            {rating.toFixed(1)}
          </div>
          <div className="text-[10px] text-gray-300 mt-0">
            基于{validPlatformsCount}个平台的加权计算
          </div>
        </div>
      </div>
    </div>
  );
}