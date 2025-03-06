// ==========================================
// 搜索按钮
// ==========================================
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchByImdbId } from '../api/tmdb';

export function SearchButton() {
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      // 检查是否是IMDB ID格式
      const imdbIdMatch = query.match(/^(?:tt)?(\d{7,8})$/);
      
      if (imdbIdMatch) {
        // 如果是IMDB ID，使用find接口搜索
        const results = await searchByImdbId(imdbIdMatch[0]);
        if (results.movies.length > 0) {
          navigate(`/movie/${results.movies[0].id}`);
          return;
        } else if (results.tvShows.length > 0) {
          navigate(`/tv/${results.tvShows[0].id}`);
          return;
        }
      }
      
      // 如果不是IMDB ID或没有找到结果，使用普通搜索
      navigate('/', { state: { searchQuery: query.trim() } });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSearch(false);
    } else if (e.key === 'Enter') {
      const input = e.currentTarget;
      handleSearch(input.value);
      setShowSearch(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowSearch(true)}
        className="fixed top-2 left-2 z-30 p-2 rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-sm transition-colors"
        aria-label="搜索"
      >
        <Search className="w-4 h-4 text-gray-700 dark:text-white" />
      </button>

      {showSearch && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-20">
          <div className="w-full max-w-2xl mx-4">
            <input
              type="text"
              autoFocus
              placeholder="搜索电影或电视剧..."
              className="w-full px-2 py-1.5 text-lg rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onClick={() => setShowSearch(false)}
          />
        </div>
      )}
    </>
  );
} 