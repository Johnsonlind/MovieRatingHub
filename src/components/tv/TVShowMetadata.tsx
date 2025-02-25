import { Calendar, Tag, PlayCircle } from 'lucide-react';
import { formatDate } from '../../lib/utils';

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
  console.log('TVShowMetadata props:', {
    status,
    firstAirDate,
    lastAirDate,
    episodeCount,
    seasonCount,
    genres
  });

  return (
    <div className="container mx-auto px-4 py-4 sm:py-6">
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
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
          
          {/* 类型 */}
          {genres && genres.length > 0 && (
            <div className="col-span-2 sm:col-span-1 flex flex-wrap gap-1 sm:gap-2">
              {genres.map((genre: string) => (
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