// ==========================================
// 通用媒体元数据组件
// ==========================================
import { Clock, Calendar, Tag, PlayCircle } from 'lucide-react';
import { formatRuntime, formatDate } from '../../utils/utils';

// 电影元数据组件
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

// 剧集元数据组件
interface TVShowMetadataProps {
  status: string;
  firstAirDate: string;
  lastAirDate: string;
  episodeCount: number;
  seasonCount: number;
  genres: string[];
}

export function TVShowMetadata({ 
  status, 
  firstAirDate, 
  lastAirDate, 
  episodeCount,
  seasonCount,
  genres 
}: TVShowMetadataProps) {
  return (
    <div className="container mx-auto px-4 py-4 sm:py-6">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {status && (
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
              <span className="text-sm sm:text-base text-gray-700 dark:text-white">
                {status === 'Ended' ? '已完结' : '连载中'}
              </span>
            </div>
          )}
          
          {firstAirDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
              <span className="text-sm sm:text-base text-gray-700 dark:text-white">
                {formatDate(firstAirDate)}
                {status === 'Ended' && lastAirDate && ` - ${formatDate(lastAirDate)}`}
              </span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            <span className="text-sm sm:text-base text-gray-700 dark:text-white">
              {seasonCount} 季 {episodeCount} 集
            </span>
          </div>
          
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
