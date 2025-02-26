import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface FavoriteButtonProps {
  mediaId: string;
  mediaType: string;
  title: string;
  poster: string;
  year: string;
}

export function FavoriteButton({ mediaId, mediaType, title, poster, year }: FavoriteButtonProps) {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkFavoriteStatus = async () => {
      if (!user) return;
      
      try {
        const response = await fetch('/api/favorites', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const favorites = await response.json();
          setIsFavorited(
            favorites.some(
              (f: any) => f.media_id === mediaId && f.media_type === mediaType
            )
          );
        }
      } catch (error) {
        console.error('检查收藏状态失败:', error);
      }
    };

    checkFavoriteStatus();
  }, [user, mediaId, mediaType]);

  const handleFavorite = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          media_id: mediaId,
          media_type: mediaType,
          title,
          year,
          poster
        })
      });

      if (response.ok) {
        setIsFavorited(!isFavorited);
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <button
      onClick={handleFavorite}
      disabled={isLoading}
      className={`fixed bottom-20 left-2 z-30 p-2 rounded-full backdrop-blur-sm transition-colors
        ${isFavorited 
          ? 'bg-yellow-500 hover:bg-yellow-600' 
          : 'bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20'
        }`}
      aria-label={isFavorited ? '取消收藏' : '收藏'}
    >
      <Star 
        className={`w-4 h-4 ${
          isFavorited ? 'text-white' : 'text-gray-700 dark:text-white'
        }`} 
        fill={isFavorited ? 'currentColor' : 'none'}
      />
    </button>
  );
} 