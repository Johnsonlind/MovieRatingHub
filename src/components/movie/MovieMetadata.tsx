// ==========================================
// 电影元数据组件 - 显示电影的上映日期、时长、类型等信息
// ==========================================
import { Clock, Calendar, Tag } from 'lucide-react';
import { formatRuntime } from '../../utils/utils';

interface MovieMetadataProps {
  rating?: string;
  releaseDate: string;
  runtime?: number;
  genres?: string[];
}

export function MovieMetadata({ rating, releaseDate, runtime, genres }: MovieMetadataProps) {
  return (
    <div className="container mx-auto px-4 py-4 sm:py-6">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {rating && (
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
              <span className="text-sm sm:text-base text-gray-700 dark:text-white">{rating}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            <span className="text-sm sm:text-base text-gray-700 dark:text-white">{releaseDate}</span>
          </div>
          
          {runtime && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
              <span className="text-sm sm:text-base text-gray-700 dark:text-white">{formatRuntime(runtime)}</span>
            </div>
          )}

          {genres && genres.length > 0 && (
            <div className="col-span-2 sm:col-span-1 flex flex-wrap gap-1 sm:gap-2">
              {genres.map(genre => (
                <span 
                  key={genre}
                  className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs sm:text-sm"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}