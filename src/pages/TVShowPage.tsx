import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { TVShowHero } from '../components/tv/TVShowHero';
import { TVShowRatingSection } from '../components/tv/TVShowRatingSection';
import { SeasonRatings } from '../components/tv/SeasonRatings';
import { Credits } from '../components/movie/Credits';
import { BackButton } from '../components/BackButton';
import { getTVShow } from '../lib/api/tmdb/tv';
import { messages } from '../lib/constants/messages';
import { exportToPng } from '../lib/utils/export';
import { ExportTVShowRatingCard } from '../components/export/ExportTVShowRatingCard';
import { TVShowMetadata } from '../components/tv/TVShowMetadata';

export default function TVShowPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tvShow, isLoading, error } = useQuery({
    queryKey: ['tv', id],
    queryFn: () => getTVShow(id!),
    enabled: !!id,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const handleExport = async () => {
    if (!tvShow) return;
    
    setIsExporting(true);
    try {
      // Ensure the export element exists
      const exportElement = document.getElementById('export-content');
      if (!exportElement) {
        throw new Error('Export element not found');
      }

      const filename = `${tvShow.title}${selectedSeason ? `-S${selectedSeason}` : ''}-ratings.png`;
      
      await exportToPng('export-content', filename, {
        quality: 0.95,
        backgroundColor: '#fff',
        pixelRatio: 2,
      });
    } catch (error) {
      console.error('Export error:', error);
      alert(messages.errors.exportFailed);
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

  if (error || !tvShow) {
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
      
      <div className="tv-show-content">
        <TVShowHero tvShow={tvShow} backdropUrl={tvShow.backdrop} />
        <TVShowMetadata
          status={tvShow.status}
          firstAirDate={tvShow.firstAirDate}
          lastAirDate={tvShow.lastAirDate}
          genres={tvShow.genres}
        />
        <TVShowRatingSection tvShow={tvShow} />
        <SeasonRatings seasons={tvShow.seasons || []} />
        <Credits
          cast={tvShow.credits.cast}
          crew={tvShow.credits.crew}
        />
      </div>

      {/* Export content container */}
      <div className="fixed left-0 top-0 -z-50 opacity-0">
        <div id="export-content" className="w-[1200px] bg-white">
          <ExportTVShowRatingCard 
            tvShow={tvShow} 
            selectedSeason={selectedSeason}
          />
        </div>
      </div>
      
      {/* Export controls */}
      <div className="fixed bottom-8 right-8 flex flex-col gap-2">
        {tvShow.seasons && tvShow.seasons.length > 0 && (
          <select
            value={selectedSeason || ''}
            onChange={(e) => setSelectedSeason(e.target.value ? Number(e.target.value) : null)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">导出整部剧集评分</option>
            {tvShow.seasons.map((season) => (
              <option key={season.seasonNumber} value={season.seasonNumber}>
                导出第 {season.seasonNumber} 季评分
              </option>
            ))}
          </select>
        )}
        
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