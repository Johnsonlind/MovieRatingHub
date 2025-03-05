// ==========================================
// 收藏列表页
// ==========================================
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../utils/ThemeToggle';
import { SearchButton } from '../utils/SearchButton';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { useAuth } from '../components/auth/AuthContext';
import { toast } from "sonner";
import { AuthModal } from '../components/auth/AuthModal';
import { DragDropContext, Draggable, DropResult } from '@hello-pangea/dnd';
import { StrictModeDroppable } from '../utils/StrictModeDroppable';

interface FavoriteList {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  user_id: number;
  is_collected: boolean;
  favorites: Favorite[];
}

interface Favorite {
  id: number;
  media_id: string;
  media_type: string;
  title: string;
  poster: string;
  year: string;
  overview: string;
  note: string | null;
}

// 排序类型定义
type SortType = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc' | 'custom';

export default function FavoriteListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState<FavoriteList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [editingList, setEditingList] = useState<FavoriteList | null>(null);
  const [sortType, setSortType] = useState<SortType>('time_desc');
  const [sortedFavorites, setSortedFavorites] = useState<Favorite[]>([]);

  useEffect(() => {
    const fetchListDetails = async () => {
      try {
        const response = await fetch(`/api/favorite-lists/${id}`, {
          headers: user ? {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          } : undefined
        });
        if (response.ok) {
          const data = await response.json();
          setList(data);
          setEditingList(data);
        }
      } catch (error) {
        console.error('获取收藏列表详情失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchListDetails();
  }, [id, user]);

  // 排序函数
  const sortFavorites = (favorites: Favorite[], type: SortType) => {
    switch (type) {
      case 'time_asc':
        return [...favorites].sort((a, b) => a.id - b.id);
      case 'time_desc':
        return [...favorites].sort((a, b) => b.id - a.id);
      case 'name_asc':
        return [...favorites].sort((a, b) => a.title.localeCompare(b.title));
      case 'name_desc':
        return [...favorites].sort((a, b) => b.title.localeCompare(a.title));
      default:
        return favorites;
    }
  };

  // 更新 useEffect 以处理排序
  useEffect(() => {
    if (list?.favorites) {
      setSortedFavorites(sortFavorites(list.favorites, sortType));
    }
  }, [list?.favorites, sortType]);

  // 拖拽结束处理函数
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !list) return;
  
    const { source, destination } = result;
    
    // 如果拖放到相同位置，不做任何操作
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
  
    const newItems = Array.from(sortedFavorites);
    const [reorderedItem] = newItems.splice(source.index, 1);
    newItems.splice(destination.index, 0, reorderedItem);
    
    // 立即更新UI
    setSortedFavorites(newItems);
    
    try {
      const response = await fetch(`/api/favorite-lists/${id}/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          favorite_ids: newItems.map(item => item.id)
        })
      });
  
      if (!response.ok) {
        // 如果请求失败，获取错误详情
        const errorData = await response.json();
        throw new Error(errorData.detail || '保存排序失败');
      }
      
      toast.success('排序已保存');
    } catch (error) {
      console.error('保存排序失败:', error);
      toast.error(error instanceof Error ? error.message : '保存排序失败');
      
      // 如果保存失败，恢复原始顺序
      if (list?.favorites) {
        setSortedFavorites([...list.favorites]);
      }
    }
  };

  const handleEditList = async () => {
    if (!editingList) return;

    try {
      const response = await fetch(`/api/favorite-lists/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: editingList.name,
          description: editingList.description,
          is_public: editingList.is_public
        })
      });

      if (response.ok) {
        const updatedList = await response.json();
        setList(prev => ({
          ...updatedList,
          user_id: prev?.user_id || updatedList.user_id
        }));
        setShowEditDialog(false);
      }
    } catch (error) {
      console.error('更新收藏列表失败:', error);
    }
  };

  const handleDeleteList = async () => {
    if (!confirm('确定要删除这个收藏列表吗？')) return;

    try {
      const response = await fetch(`/api/favorite-lists/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        navigate('/profile');
      }
    } catch (error) {
      console.error('删除收藏列表失败:', error);
    }
  };

  const handleRemoveFavorite = async (favoriteId: number) => {
    try {
      const response = await fetch(`/api/favorites/${favoriteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setList(prev => prev ? {
          ...prev,
          favorites: prev.favorites.filter(f => f.id !== favoriteId)
        } : null);
      }
    } catch (error) {
      console.error('移除收藏失败:', error);
    }
  };

  const handleCollectList = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await fetch(`/api/favorite-lists/${id}/collect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('收藏成功');
        navigate(`/favorite-lists/${data.list_id}`);
      }
    } catch (error) {
      console.error('收藏列表失败:', error);
      toast.error('收藏失败');
    }
  };

  if (isLoading) {
    return <div>加载中...</div>;
  }

  if (!list) {
    return <div>未找到收藏列表</div>;
  }

  const isOwner = user?.id === list.user_id;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-indigo-600 p-4">
      <ThemeToggle />
      <SearchButton />

      <div className="max-w-5xl mx-auto space-y-6">
        {/* 列表标题和描述 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold dark:text-white mb-2">{list.name}</h1>
              {list.description && (
                <p className="text-gray-600 dark:text-gray-300">{list.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              {isOwner ? (
                <>
                  {list.is_public && (
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href)
                          .then(() => {
                            toast.success("链接已复制到剪贴板");
                          })
                          .catch(() => {
                            toast.error("复制链接失败");
                          });
                      }}
                    >
                      分享
                    </Button>
                  )}
                  <Button onClick={() => setShowEditDialog(true)}>
                    编辑
                  </Button>
                  <Button onClick={handleDeleteList}>
                    删除
                  </Button>
                </>
              ) : (
                list.is_public && !list.is_collected && (
                  <Button onClick={handleCollectList}>
                    收藏列表
                  </Button>
                )
              )}
            </div>
          </div>
        </div>

        {/* 排序控制 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
          <select
            value={sortType}
            onChange={(e) => setSortType(e.target.value as SortType)}
            className="px-4 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 
              dark:border-gray-600 text-gray-900 dark:text-gray-100"
          >
            <option value="time_desc">最新添加</option>
            <option value="time_asc">最早添加</option>
            <option value="name_asc">名称正序</option>
            <option value="name_desc">名称倒序</option>
            {isOwner && <option value="custom">自定义排序</option>}
          </select>
        </div>

        {/* 可拖拽列表 */}
        <div className="space-y-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <StrictModeDroppable droppableId="favorites-list">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {sortedFavorites.map((favorite, index) => (
                    <Draggable
                      key={`favorite-${favorite.id}`}
                      draggableId={`favorite-${favorite.id}`}
                      index={index}
                      isDragDisabled={sortType !== 'custom' || !isOwner}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mb-4
                            ${snapshot.isDragging ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          <div className="flex">
                            {/* 海报 */}
                            <div className="w-48 flex-shrink-0">
                              <img
                                src={favorite.poster}
                                alt={favorite.title}
                                className="w-full h-72 object-cover"
                              />
                            </div>

                            {/* 内容信息 */}
                            <div className="flex-1 p-6 relative">
                              {isOwner && (
                                <button
                                  onClick={() => handleRemoveFavorite(favorite.id)}
                                  className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center rounded-full 
                                    text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 
                                    transition-colors"
                                >
                                  ×
                                </button>
                              )}
                              <div className="flex items-baseline gap-3 mb-2">
                                <h2 className="text-xl font-bold dark:text-white">
                                  {favorite.title}
                                </h2>
                                <span className="text-gray-500 dark:text-gray-400">
                                  {favorite.year}
                                </span>
                              </div>
                              
                              <p className="text-gray-600 dark:text-gray-300 line-clamp-3 mb-4">
                                {favorite.overview}
                              </p>

                              {favorite.note && (
                                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                  <p className="text-sm text-gray-600 dark:text-gray-300">
                                    {favorite.note}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </StrictModeDroppable>
          </DragDropContext>
        </div>
      </div>

      <Dialog
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        title="编辑收藏列表"
      >
        {editingList && (
          <div className="space-y-4">
            <Input
              label="列表名称"
              value={editingList.name}
              onChange={(e) => setEditingList({
                ...editingList,
                name: e.target.value
              })}
            />
            <Textarea
              label="列表描述（可选）"
              value={editingList.description || ''}
              onChange={(e) => setEditingList({
                ...editingList,
                description: e.target.value
              })}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={editingList.is_public}
                onCheckedChange={(checked) => setEditingList({
                  ...editingList,
                  is_public: checked
                })}
              />
              <span>公开列表</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
              >
                取消
              </Button>
              <Button onClick={handleEditList}>
                保存
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}