// ==========================================
// 媒体卡片组件 - 显示单个影视作品的卡片
// ==========================================
import { Link } from 'react-router-dom';
import type { Media } from '../types/media';

interface MediaCardProps {
  item: Media;
}

export function MediaCard({ item }: MediaCardProps) {
  const linkPath = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
  
  return (
    <Link to={linkPath} className="group block">
      <div className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg">
        <div className="flex">
          {/* 海报 */}
          <div className="w-16 sm:w-20 lg:w-24 h-24 sm:h-28 lg:h-36 flex-shrink-0">
            <img
              src={item.poster}
              alt={item.title}
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          
          {/* 内容 */}
          <div className="flex-1 p-2 sm:p-3 flex flex-col justify-center">
            <h3 className="font-medium text-sm sm:text-base lg:text-lg line-clamp-2">
              {item.title}
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{item.year}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}