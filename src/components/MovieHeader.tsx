import { Star } from 'lucide-react';
import { Movie } from '../types/movie';
import { MovieRatingData } from '../types/ratings';
import { calculateOverallRating } from '../components/ratings/calculateOverallrating';

interface MovieHeaderProps {
  movie: Movie;
  ratingData: MovieRatingData;
}

export function MovieHeader({ movie, ratingData }: MovieHeaderProps) {
  const ratingResult = calculateOverallRating(ratingData);

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      
      <div className="container mx-auto px-4 py-8 relative">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-64 flex-shrink-0">
            <img
              src={movie.poster}
              alt={movie.title}
              crossOrigin="anonymous"
              className="w-full rounded-lg shadow-lg"
            />
          </div>
          
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-white mb-2">
              {movie.title} <span className="text-gray-300">({movie.year})</span>
            </h1>
            
            {ratingResult?.rating && (
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <span className="text-xl font-semibold text-white">
                    {Number(ratingResult.rating).toFixed(1)}
                  </span>
                </div>
              </div>
            )}
            
            <p className="text-gray-200 text-lg leading-relaxed mb-6">
              {movie.overview}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}