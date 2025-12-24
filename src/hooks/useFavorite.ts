// ==========================================
// 收藏功能 Hook
// ==========================================
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../components/auth/AuthContext';
import { getMediaDetails } from '../api/tmdb';

interface FavoriteList {
  id: number;
  name: string;
  favorites?: Array<{
    id: number;
    media_id: string;
    media_type: string;
    title: string;
    poster: string;
    year: string;
    overview: string;
  }>;
}

interface UseFavoriteOptions {
  mediaId: string;
  mediaType: string;
  title: string;
  poster: string;
  year?: string;
  overview?: string;
  useReactQuery?: boolean; // 是否使用 React Query（MiniFavoriteButton 使用）
}

interface UseFavoriteReturn {
  isFavorited: boolean;
  isLoading: boolean;
  showDialog: boolean;
  showAuthModal: boolean;
  lists: FavoriteList[];
  selectedList: number | null;
  note: string;
  showCreateList: boolean;
  newList: { name: string; description: string; is_public: boolean };
  setShowDialog: (show: boolean) => void;
  setShowAuthModal: (show: boolean) => void;
  setSelectedList: (id: number | null) => void;
  setNote: (note: string) => void;
  setShowCreateList: (show: boolean) => void;
  setNewList: (list: { name: string; description: string; is_public: boolean }) => void;
  handleCreateList: () => Promise<void>;
  handleFavorite: () => Promise<void>;
  handleButtonClick: (e: React.MouseEvent) => void;
  refetch?: () => void;
}

export function useFavorite({
  mediaId,
  mediaType,
  title,
  poster,
  year,
  overview = '',
  useReactQuery = false
}: UseFavoriteOptions): UseFavoriteReturn {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedList, setSelectedList] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [showCreateList, setShowCreateList] = useState(false);
  const [newList, setNewList] = useState({
    name: '',
    description: '',
    is_public: false
  });

  // 使用 React Query 获取列表（MiniFavoriteButton）
  const { data: queryLists = [], refetch } = useQuery<FavoriteList[]>({
    queryKey: ['favorite-lists'],
    queryFn: async () => {
      const response = await fetch('/api/favorite-lists', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch lists');
      return await response.json();
    },
    enabled: !!user && useReactQuery,
    staleTime: 1000 * 60 * 5,
  });

  // 不使用 React Query 获取列表（FavoriteButton）
  const [lists, setLists] = useState<FavoriteList[]>([]);

  useEffect(() => {
    if (!useReactQuery && user) {
      const fetchLists = async () => {
        try {
          const response = await fetch('/api/favorite-lists', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setLists(data);
            if (data.length > 0) {
              setSelectedList(data[0].id);
            }
          }
        } catch (error) {
          console.error('获取收藏列表失败:', error);
        }
      };
      fetchLists();
    }
  }, [user, useReactQuery]);

  // 使用 React Query 的列表
  const currentLists = useReactQuery ? queryLists : lists;

  useEffect(() => {
    if (currentLists.length > 0 && !selectedList) {
      setSelectedList(currentLists[0].id);
    }
  }, [currentLists, selectedList]);

  useEffect(() => {
    if (!user || currentLists.length === 0) {
      setIsFavorited(false);
      return;
    }
    
    const isInAnyList = currentLists.some(list => 
      list.favorites?.some(
        fav => fav.media_id === mediaId && fav.media_type === mediaType
      )
    );
    
    setIsFavorited(isInAnyList);
  }, [user, currentLists, mediaId, mediaType]);

  const handleCreateList = async () => {
    try {
      const response = await fetch('/api/favorite-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newList)
      });

      if (response.ok) {
        const data = await response.json();
        if (useReactQuery) {
          setSelectedList(data.id);
          setShowCreateList(false);
          setNewList({ name: '', description: '', is_public: false });
          refetch?.();
        } else {
          setLists([...lists, data]);
          setSelectedList(data.id);
          setShowCreateList(false);
          setNewList({ name: '', description: '', is_public: false });
        }
      }
    } catch (error) {
      console.error('创建收藏列表失败:', error);
    }
  };

  const handleFavorite = async () => {
    if (!user || !selectedList) return;
    
    setIsLoading(true);
    try {
      let finalTitle = title;
      let finalPoster = poster;
      let finalYear = year;
      let finalOverview = overview;
      
      // MiniFavoriteButton 的逻辑：如果缺少信息，从 API 获取
      if ((!year || !overview) && useReactQuery) {
        try {
          const details = await getMediaDetails(mediaType, mediaId);
          finalTitle = details.title || title;
          finalPoster = poster || details.poster;
          finalYear = details.year || year || '';
          finalOverview = details.overview || overview || '';
        } catch (error) {
          console.error('获取影视详情失败，使用已有信息:', error);
        }
      }
      
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          media_id: mediaId,
          media_type: mediaType,
          title: finalTitle,
          year: finalYear || '',
          poster: finalPoster,
          overview: finalOverview || '',
          list_id: selectedList,
          note
        })
      });

      if (response.ok) {
        setIsFavorited(true);
        setShowDialog(false);
        setNote('');
        if (useReactQuery) {
          refetch?.();
        }
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user && useReactQuery) {
      setShowAuthModal(true);
      return;
    }
    
    setShowDialog(true);
  };

  return {
    isFavorited,
    isLoading,
    showDialog,
    showAuthModal,
    lists: currentLists,
    selectedList,
    note,
    showCreateList,
    newList,
    setShowDialog,
    setShowAuthModal,
    setSelectedList,
    setNote,
    setShowCreateList,
    setNewList,
    handleCreateList,
    handleFavorite,
    handleButtonClick,
    refetch: useReactQuery ? refetch : undefined
  };
}
