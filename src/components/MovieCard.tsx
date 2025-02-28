import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { formatRating, calculateAverageRating } from '../lib/utils';

interface MovieCardProps {
  movie: Movie;
}

interface Movie {
  id: string;
  title: string;
  year: string;
  poster: string;
  ratings?: {
    douban?: number;
    imdb?: number;
    tmdb?: number;
  };
}

export function MovieCard({ movie }: MovieCardProps) {
  const { ratings } = movie;

  return (
    <Link to={`/movie/${movie.id}`} className="group">
      <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-200 group-hover:scale-105">
        <div className="aspect-[2/3] relative">
          <img
            src={movie.poster}
            alt={movie.title}
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute top-2 right-2 bg-black/75 text-white px-2 py-1 rounded-full text-sm flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-400" />
            <span>{formatRating(calculateAverageRating(movie.ratings))}</span>
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-lg truncate">{movie.title}</h3>
          <p className="text-gray-600">{movie.year}</p>
          {ratings && (
            <div className="ratings">
              {ratings.douban && <span>豆瓣: {ratings.douban}</span>}
              {ratings.imdb && <span>IMDb: {ratings.imdb}</span>}
              {ratings.tmdb && <span>TMDB: {ratings.tmdb}</span>}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}