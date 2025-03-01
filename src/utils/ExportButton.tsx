// ==========================================
// 导出按钮
// ==========================================
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
    
    await onSeasonChange?.(season);
    setShowSeasonSelect(false);
    
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          await onExport();
          resolve(null);
        });
      });
    });
  };

  return (
    <div className="fixed bottom-11 left-2 z-30">
      {seasons.length > 0 && showSeasonSelect && (
        <div className="absolute bottom-full left-8 mb-2">
          <select
            value={selectedSeason || ''}
            onChange={(e) => {
              handleSeasonChange(e.target.value ? Number(e.target.value) : undefined);
            }}
            className="w-28 text-xs px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg"
            disabled={isExporting}
          >
            <option value="">整部剧集</option>
            {seasons.map((season) => (
              <option key={season.seasonNumber} value={season.seasonNumber}>
                第 {season.seasonNumber} 季
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={isExporting}
        className="p-2 rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-sm transition-colors"
        aria-label={isExporting ? '导出中' : '导出评分卡片'}
      >
        <Download className={`w-4 h-4 text-gray-700 dark:text-white ${isExporting ? 'animate-bounce' : ''}`} />
      </button>
    </div>
  );
} 