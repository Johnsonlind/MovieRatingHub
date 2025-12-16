// ==========================================
// 精简收藏按钮组件 - 用于首页和搜索结果
// ==========================================
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useAuth } from '../components/auth/AuthContext';
import { AuthModal } from '../components/auth/AuthModal';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { getMediaDetails } from '../api/tmdb';

interface MiniFavoriteButtonProps {
  mediaId: string;
  mediaType: string;
  title: string;
  poster: string;
  year?: string;
  overview?: string;
  className?: string;
}

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

export function MiniFavoriteButton({ 
  mediaId, 
  mediaType, 
  title, 
  poster, 
  year, 
  overview = '',
  className = ''
}: MiniFavoriteButtonProps) {
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

  // 使用 React Query 获取收藏列表并缓存
  const { data: lists = [], refetch } = useQuery<FavoriteList[]>({
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
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5分钟内认为数据是新鲜的
  });

  // 设置默认列表
  useEffect(() => {
    if (lists.length > 0 && !selectedList) {
      setSelectedList(lists[0].id);
    }
  }, [lists, selectedList]);

  // 检查当前媒体是否已在收藏列表中
  useEffect(() => {
    if (!user || lists.length === 0) {
      setIsFavorited(false);
      return;
    }
    
    // 遍历所有收藏列表，检查是否包含当前媒体
    const isInAnyList = lists.some(list => 
      list.favorites?.some(
        fav => fav.media_id === mediaId && fav.media_type === mediaType
      )
    );
    
    setIsFavorited(isInAnyList);
  }, [user, lists, mediaId, mediaType]);

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
        // 设置新创建的列表为选中状态
        setSelectedList(data.id);
        setShowCreateList(false);
        setNewList({ name: '', description: '', is_public: false });
        // 重新获取列表数据
        refetch();
      }
    } catch (error) {
      console.error('创建收藏列表失败:', error);
    }
  };

  const handleFavorite = async () => {
    if (!user || !selectedList) return;
    
    setIsLoading(true);
    try {
      // 如果没有年份或简介，先从TMDB获取详细信息
      let finalTitle = title;
      let finalPoster = poster;
      let finalYear = year;
      let finalOverview = overview;
      
      if (!year || !overview) {
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
        // 重置状态
        setNote('');
        // 刷新收藏列表数据以更新状态
        refetch();
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault(); // 阻止链接导航
    e.stopPropagation(); // 阻止事件冒泡
    
    if (!user) {
      // 未登录时显示登录框
      setShowAuthModal(true);
      return;
    }
    
    // 已登录时显示对话框，让用户选择列表
    setShowDialog(true);
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={isLoading}
        className={`${className || 'p-1.5'} rounded-full glass-button transition-all z-10
          ${isFavorited 
            ? '!bg-yellow-500/80 hover:!bg-yellow-500' 
            : ''
          }
        `}
        aria-label={isFavorited ? '已收藏' : '收藏'}
        title={isFavorited ? '已收藏' : '收藏'}
      >
        <Star 
          className={`w-3 h-3 ${
            isFavorited 
              ? 'text-white' 
              : 'text-gray-800 dark:text-white'
          }`} 
          fill={isFavorited ? 'currentColor' : 'none'}
        />
      </button>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={isFavorited ? "修改收藏" : "添加到收藏"}
      >
        <div className="space-y-4">
          {showCreateList ? (
            <div className="space-y-4">
              <Input
                label="列表名称"
                value={newList.name}
                onChange={(e) => setNewList({...newList, name: e.target.value})}
              />
              <Textarea
                label="列表描述（可选）"
                value={newList.description}
                onChange={(e) => setNewList({...newList, description: e.target.value})}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={newList.is_public}
                  onCheckedChange={(checked) => setNewList({...newList, is_public: checked})}
                />
                <span>公开列表</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateList}>创建</Button>
                <Button variant="outline" onClick={() => setShowCreateList(false)}>取消</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium">选择收藏列表</label>
                <Button variant="outline" onClick={() => setShowCreateList(true)}>
                  创建新列表
                </Button>
              </div>
              <select
                value={selectedList || ''}
                onChange={(e) => setSelectedList(Number(e.target.value))}
                className="w-full rounded-md border-2 border-gray-300 dark:border-gray-600 
                  bg-white dark:bg-gray-700 
                  text-gray-900 dark:text-gray-100"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
              <Textarea
                label="添加备注（可选）"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="添加你的观影感受..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleFavorite} disabled={isLoading || !selectedList}>
                  {isLoading ? '保存中...' : '保存'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
