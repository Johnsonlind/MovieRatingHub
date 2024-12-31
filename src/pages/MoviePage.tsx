import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { MovieHero } from '../components/movie/MovieHero';
import { MovieMetadata } from '../components/movie/MovieMetadata';
import { Credits } from '../components/movie/Credits';
import { MovieRatingSection } from '../components/movie/MovieRatingSection';
import { ExportRatingCard } from '../components/export/ExportRatingCard';
import { BackButton } from '../components/BackButton';
import { exportToPng } from '../lib/export';
import { getMovie } from '../lib/api/tmdb/index';
import { messages } from '../lib/constants/messages';

export default function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const [isExporting, setIsExporting] = useState(false);
  const { data: movie, isLoading, error } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => getMovie(id!),
    enabled: !!id,
  });

  const formatRuntime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}小时${remainingMinutes}分钟`;
  };

  const handleExport = async () => {
    if (!movie) return;
    setIsExporting(true);
    try {
      await exportToPng(
        'export-content',
        `${movie.title}-ratings.png`,
        {
          quality: 0.95,
          backgroundColor: '#fff',
          pixelRatio: 2,
        }
      );
    } catch (error) {
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600">{messages.errors.loadMovieFailed}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BackButton />
      
      <div className="movie-content">
        <MovieHero movie={movie} backdropUrl={movie.backdrop} />
        <MovieMetadata
          rating={movie.certification}
          releaseDate={movie.releaseDate}
          runtime={movie.runtime ? formatRuntime(movie.runtime) : undefined}
          genres={movie.genres}
        />
        <MovieRatingSection movie={movie} />
        <Credits
          cast={movie.credits.cast}
          crew={movie.credits.crew}
        />
      </div>

      {/* 导出内容（隐藏） */}
      <div className="fixed left-0 top-0 -z-50 opacity-0">
        <div id="export-content" className="p-8 bg-white">
          <ExportRatingCard movie={movie} />
        </div>
      </div>
      
      {/* 导出按钮 */}
      <div className="fixed bottom-8 right-8">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="export-button bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-colors"
        >
          <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
          {isExporting ? '导出中...' : '导出评分'}
        </button>
      </div>
    </div>
  );
}