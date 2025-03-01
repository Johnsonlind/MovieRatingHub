// ==========================================
// 星星评分
// ==========================================
import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  maxRating: number;
}

export function StarRating({ rating, maxRating }: StarRatingProps) {
  // 将评分转换为5星制
  const normalizedRating = (rating / maxRating) * 5;
  
  // 获取完整星星数量
  const fullStars = Math.floor(normalizedRating);
  
  // 判断是否需要半星
  const hasHalfStar = normalizedRating % 1 >= 0.3;
  
  return (
    <div className="flex">
      {[...Array(5)].map((_, i) => {
        if (i < fullStars) {
          // 完整星星
          return (
            <Star
              key={i}
              className="text-yellow-400"
              fill="currentColor"
            />
          );
        } else if (i === fullStars && hasHalfStar) {
          // 半星
          return (
            <div key={i} className="relative">
              <Star className="text-gray-600" />
              <div className="absolute inset-0 overflow-hidden w-1/2">
                <Star className="text-yellow-400" fill="currentColor" />
              </div>
            </div>
          );
        } else {
          // 空星
          return (
            <Star
              key={i}
              className="text-gray-600"
            />
          );
        }
      })}
    </div>
  );
} 