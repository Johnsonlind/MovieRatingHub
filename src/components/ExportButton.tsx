import { Download } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Season {
  seasonNumber: number;
}

interface ExportButtonProps {
  onExport: () => Promise<void>;
  seasons?: Season[];
  selectedSeason?: number;
  onSeasonChange?: (season: number | undefined) => void;
  isExporting: boolean;
}

export function ExportButton({ 
  onExport, 
  seasons = [],
  selectedSeason,
  onSeasonChange,
  isExporting
}: ExportButtonProps) {
  const [showSeasonSelect, setShowSeasonSelect] = useState(false);

  useEffect(() => {
    if (showSeasonSelect) {
      const timer = setTimeout(() => {
        setShowSeasonSelect(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showSeasonSelect]);

  const handleClick = async () => {
    if (seasons.length > 0 && !showSeasonSelect) {
      setShowSeasonSelect(true);
      return;
    }
    
    setShowSeasonSelect(false);
    await onExport();
  };

  const handleSeasonChange = async (season: number | undefined) => {
    onSeasonChange?.(season);
    setShowSeasonSelect(false);
    await onExport();
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isExporting}
        className="fixed bottom-14 left-2 z-30 p-2 rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-sm transition-colors"
        aria-label={isExporting ? '导出中' : '导出评分卡片'}
      >
        <Download className={`w-4 h-4 text-gray-700 dark:text-white ${isExporting ? 'animate-bounce' : ''}`} />
      </button>

      {seasons.length > 0 && showSeasonSelect && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-20">
          <div className="w-full max-w-xs mx-4">
            <select
              value={selectedSeason || ''}
              onChange={(e) => {
                handleSeasonChange(e.target.value ? Number(e.target.value) : undefined);
              }}
              className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
              disabled={isExporting}
            >
              <option value="">导出整部剧集评分</option>
              {seasons.map((season) => (
                <option key={season.seasonNumber} value={season.seasonNumber}>
                  导出第 {season.seasonNumber} 季评分
                </option>
              ))}
            </select>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onClick={() => setShowSeasonSelect(false)}
          />
        </div>
      )}
    </>
  );
} 
