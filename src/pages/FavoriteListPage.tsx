// ==========================================
// 收藏列表详情页 - 显示列表详情、支持拖拽排序和编辑
// ==========================================
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../utils/ThemeToggle';
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
import { NavBar } from '../utils/NavBar';
import { ScrollToTopButton } from '../utils/ScrollToTopButton';

interface Creator {
  id: number;
  username: string;
  avatar: string;
  is_following?: boolean;
}

interface FavoriteList {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  user_id: number;
  creator: Creator;
  is_collected: boolean;
  favorites: Favorite[];
  original_list_id?: number;
  original_creator?: Creator;
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
  sort_order: number | null;
}

// 排序类型定义
type SortType = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc' | 'custom' | 'custom_edit';

// 视图模式类型
type ViewMode = 'list' | 'grid';

// 页脚组件
const Footer = () => (
  <div className="w-full py-6 mt-8 flex justify-center items-center gap-2">
    <a 
      href="https://weibo.com/u/2238200645" 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-balck-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
    >
      <img src="/logos/weibo.png" alt="微博" className="w-5 h-5" />
      <span>守望电影</span>
    </a>
  </div>
);

export default function FavoriteListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState<FavoriteList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [editingList, setEditingList] = useState<FavoriteList | null>(null);
  const [sortType, setSortType] = useState<SortType>('custom');
  const [sortedFavorites, setSortedFavorites] = useState<Favorite[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [editingFavorite, setEditingFavorite] = useState<Favorite | null>(null);

  useEffect(() => {
    const fetchListDetails = async () => {
      try {
        setIsLoading(true); // 确保加载状态正确设置
        
        // 添加时间戳防止缓存
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/favorite-lists/${id}?_=${timestamp}`, {
          headers: user ? {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          } : undefined
        });
        
        if (response.ok) {
          // 使用 Promise.all 并行处理数据
          const data = await response.json();
          
          // 添加空值检查
          if (data && Array.isArray(data.favorites)) {
            // 使用 Web Worker 或 requestIdleCallback 处理大量数据
            // 这里简化为直接处理
            const processedData = {
              ...data,
              favorites: data.favorites.map((f: Favorite) => ({
                ...f,
                // 预处理数据，避免在渲染时计算
                sort_order: f.sort_order ?? Infinity
              }))
            };
            
            // 检查是否存在自定义排序
            const hasCustomSort = processedData.favorites.some((f: Favorite) => f.sort_order !== null);
            
            if (hasCustomSort) {
              // 如果存在自定义排序，按照 sort_order 排序
              processedData.favorites.sort((a: Favorite, b: Favorite) => {
                // 使用空值合并运算符确保比较的是数字
                const aOrder = a.sort_order !== null ? a.sort_order : Infinity;
                const bOrder = b.sort_order !== null ? b.sort_order : Infinity;
                return aOrder - bOrder;
              });
            }
            
            // 使用函数式更新确保状态一致性
            setList(processedData);
            setEditingList(processedData);
            setSortedFavorites(processedData.favorites);
            
            // 设置默认排序方式
            setSortType('custom');
            
            // 预加载图片资源
            processedData.favorites.forEach((favorite: Favorite) => {
              const img = new Image();
              img.src = favorite.poster;
            });
          } else {
            // 如果 favorites 不是数组，设置为空数组
            setList({...data, favorites: []});
            setEditingList({...data, favorites: []});
            setSortedFavorites([]);
            setSortType('custom');
          }
        }
      } catch (error) {
        toast.error('获取列表详情失败');
        console.error('获取列表详情失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // 初始加载
    fetchListDetails();

    // 如果是收藏的列表，设置定时轮询，但使用更合理的间隔
    if (list?.original_list_id) {
      const pollInterval = setInterval(fetchListDetails, 60000); // 每60秒检查一次更新
      return () => clearInterval(pollInterval);
    }
  }, [id, user]);

  // 优化排序函数 - 使用记忆化避免重复计算
  const sortFavorites = useCallback((favorites: Favorite[], type: SortType) => {
    // 创建一个新数组避免修改原数组
    const favoritesToSort = [...favorites];
    
    switch (type) {
      case 'time_asc':
        return favoritesToSort.sort((a, b) => a.id - b.id);
      case 'time_desc':
        return favoritesToSort.sort((a, b) => b.id - a.id);
      case 'name_asc':
        return favoritesToSort.sort((a, b) => a.title.localeCompare(b.title));
      case 'name_desc':
        return favoritesToSort.sort((a, b) => b.title.localeCompare(a.title));
      default:
        return favoritesToSort;
    }
  }, []);

  // 使用 useMemo 优化排序逻辑
  useEffect(() => {
    if (list?.favorites) {
      // 使用 requestAnimationFrame 确保在下一帧渲染前更新状态
      requestAnimationFrame(() => {
        let sorted;
        if (sortType === 'custom' || sortType === 'custom_edit') {
          // 使用已排序的收藏列表
          sorted = [...list.favorites];
        } else {
          // 使用其他排序方式
          sorted = sortFavorites(list.favorites, sortType);
        }
        setSortedFavorites(sorted);
      });
    }
  }, [list?.favorites, sortType, sortFavorites]);

  // 拖拽结束处理函数
  const handleDragEnd = async (result: DropResult) => {
    // 如果是收藏的列表，不允许拖拽排序
    if (list?.original_list_id) return;
  
    if (!result.destination || !list) return;

    const { source, destination } = result;
    
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const newItems = Array.from(sortedFavorites);
    const [reorderedItem] = newItems.splice(source.index, 1);
    newItems.splice(destination.index, 0, reorderedItem);
    
    // 立即更新UI
    setSortedFavorites(newItems);
    
    try {
      // 为每个项目计算新的 sort_order
      const updatedItems = newItems.map((item, index) => ({
        id: item.id,
        sort_order: index
      }));

      const response = await fetch(`/api/favorite-lists/${id}/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          favorite_ids: updatedItems
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '保存排序失败');
      }

      const responseData = await response.json();
      
      // 使用服务器返回的数据更新状态
      setList(prev => {
        if (!prev) return null;
        return {
          ...prev,
          favorites: responseData.favorites
        };
      });
      
      toast.success('排序已保存');
    } catch (error) {
      console.error('保存排序失败:', error);
      toast.error(error instanceof Error ? error.message : '保存排序失败');
      
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

    if (!list) {
      return;
    }

    // 添加判断,不能收藏自己的列表
    if (user.id === list.user_id) {
      toast.error('不能收藏自己的列表');
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

  const handleUpdateNote = async () => {
    if (!editingFavorite) return;

    try {
      const response = await fetch(`/api/favorites/${editingFavorite.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          note: editingFavorite.note
        })
      });

      if (!response.ok) {
        throw new Error('更新备注失败');
      }

      const updatedFavorite = await response.json();
      
      // 更新列表中的数据
      setList(prev => {
        if (!prev) return null;
        return {
          ...prev,
          favorites: prev.favorites.map(f => 
            f.id === updatedFavorite.id ? updatedFavorite : f
          )
        };
      });

      // 更新排序后的数据
      setSortedFavorites(prev => 
        prev.map(f => f.id === updatedFavorite.id ? updatedFavorite : f)
      );

      setShowNoteDialog(false);
      setEditingFavorite(null);
      toast.success('备注已更新');
    } catch (error) {
      console.error('更新备注失败:', error);
      toast.error('更新备注失败');
    }
  };

  const handleFollow = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (!list || !(list.original_list_id ? list.original_creator : list.creator)) {
      toast.error('列表信息不存在');
      return;
    }

    try {
      // 获取正确的创建者ID
      const creatorId = list.original_list_id ? list.original_creator?.id : list.creator.id;
      
      // 获取当前的关注状态
      const isCurrentlyFollowing = list.original_list_id 
        ? list.original_creator?.is_following 
        : list.creator.is_following;

      const response = await fetch(`/api/users/${creatorId}/follow`, {
        method: isCurrentlyFollowing ? 'DELETE' : 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.status === 400) {
        const errorData = await response.json();
        if (errorData.detail === "不能关注自己") {
          toast.error('不能关注自己');
          return;
        }
        if (errorData.detail === "已经关注该用户") {
          // 更新状态为已关注
          setList(prev => {
            if (!prev) return null;
            
            if (prev.original_list_id && prev.original_creator) {
              return {
                ...prev,
                original_creator: {
                  ...prev.original_creator,
                  is_following: true
                }
              };
            } else {
              return {
                ...prev,
                creator: {
                  ...prev.creator,
                  is_following: true
                }
              };
            }
          });
          toast.info('您已经关注了该用户');
          return;
        }
        throw new Error(errorData.detail || '操作失败');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '操作失败');
      }

      // 更新状态
      setList(prev => {
        if (!prev) return null;
        
        if (prev.original_list_id && prev.original_creator) {
          return {
            ...prev,
            original_creator: {
              ...prev.original_creator,
              is_following: !isCurrentlyFollowing
            }
          };
        } else {
          return {
            ...prev,
            creator: {
              ...prev.creator,
              is_following: !isCurrentlyFollowing
            }
          };
        }
      });
      
      toast.success(isCurrentlyFollowing ? '取消关注成功' : '关注成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const checkFollowStatus = async (userId: number) => {
    if (!user) return false;
    
    try {
      const response = await fetch(`/api/users/${userId}/follow/status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // 更新列表中的关注状态
        setList(prev => {
          if (!prev || !prev.creator) return prev;
          return {
            ...prev,
            creator: {
              ...prev.creator,
              is_following: data.is_following
            }
          };
        });
        
        return data.is_following;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  // 在组件加载后检查关注状态
  useEffect(() => {
    if (list?.creator && user) {
      checkFollowStatus(list.creator.id);
    }
  }, [list?.creator?.id, user]);

  if (isLoading) {
    return <div>加载中...</div>;
  }

  if (!list) {
    return <div>未找到收藏列表</div>;
  }

  const isOwner = user?.id === list.user_id;

  return (
    <>
      <NavBar />
      <div className="min-h-screen bg-gradient-to-b from-blue-400 to-indigo-600 pt-16 p-4">
        <ThemeToggle />
        <ScrollToTopButton />

        <div className="max-w-5xl mx-auto space-y-6">
          {/* 列表标题和控制栏 */}
          {isLoading ? (
            // 显示骨架屏而不是简单的加载文本
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            </div>
          ) : (
            // 实际内容
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-bold dark:text-white">{list.name}</h1>
                    {!list.is_public && (
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    {list.original_list_id && (
                      <span className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                        收藏的列表
                      </span>
                    )}
                  </div>
                  {/* 创建者信息 */}
                  <div className="flex items-center gap-2">
                    {/* 创建者头像 */}
                    <div 
                      className="w-6 h-6 rounded-full overflow-hidden cursor-pointer"
                      onClick={() => navigate(`/profile/${list.original_list_id ? list.original_creator?.id : list.creator.id}`)}
                    >
                      <img 
                        src={(list.original_list_id ? list.original_creator?.avatar : list.creator.avatar) || '/default-avatar.png'} 
                        alt={(list.original_list_id ? list.original_creator?.username : list.creator.username)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* 创建者昵称 */}
                    <button
                      onClick={() => navigate(`/profile/${list.original_list_id ? list.original_creator?.id : list.creator.id}`)}
                      className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                    >
                      {list.original_list_id ? list.original_creator?.username : list.creator.username}
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      的列表
                    </span>
                    {/* 关注按钮 */}
                    {(user && (user.id !== (list.original_list_id ? list.original_creator?.id : list.creator.id))) && (
                      <button
                        onClick={handleFollow}
                        className={`
                          px-3 py-1 rounded-full text-sm
                          ${user && (list.original_list_id ? list.original_creator?.is_following : list.creator.is_following)
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            : 'bg-blue-500 text-white'}
                          hover:opacity-80 transition-opacity
                        `}
                      >
                        {user && (list.original_list_id ? list.original_creator?.is_following : list.creator.is_following) 
                          ? '取消关注' 
                          : '关注'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {isOwner ? (
                    <>
                      {list.is_public && !list.original_list_id && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.href)
                              .then(() => {
                                toast.success("链接已复制到剪贴板");
                              })
                              .catch(() => {
                                toast.error("复制链接失败");
                              });
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                          </svg>
                        </button>
                      )}
                      {!list.original_list_id && (
                        <>
                          <button
                            onClick={() => setShowEditDialog(true)}
                            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button
                            onClick={handleDeleteList}
                            className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    list?.is_public && !list?.is_collected && (
                      <button 
                        onClick={handleCollectList}
                        disabled={user?.id === list?.user_id}
                        title={user?.id === list?.user_id ? '不能收藏自己的列表' : '收藏列表'}
                        className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    )
                  )}
                </div>
              </div>
              
              {list.description && (
                <p className="text-gray-600 dark:text-gray-300 mt-2">{list.description}</p>
              )}

              {/* 排序和视图控制 - 修改为放在右下角并排成一行 */}
              <div className="mt-6 flex justify-end items-center">
                <div className="flex items-center gap-4">
                  <select
                    value={sortType}
                    onChange={(e) => setSortType(e.target.value as SortType)}
                    className="px-4 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 
                      dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  >
                    <option value="custom">默认排序</option>
                    <option value="time_asc">最早添加</option>
                    <option value="time_desc">最新添加</option>
                    <option value="name_asc">名称正序</option>
                    <option value="name_desc">名称倒序</option>
                    {isOwner && !list.original_list_id && <option value="custom_edit">自定义排序</option>}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 内容区域 - 添加延迟加载和虚拟滚动 */}
          {!isLoading && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <StrictModeDroppable droppableId="favorites-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    {viewMode === 'list' ? (
                      // 列表模式 - 考虑使用虚拟列表优化大量数据
                      sortedFavorites.map((favorite, index) => (
                        <Draggable
                          key={`favorite-${favorite.id}`}
                          draggableId={`favorite-${favorite.id}`}
                          index={index}
                          isDragDisabled={sortType !== 'custom_edit' || !isOwner || !!list.original_list_id}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mb-4
                                ${snapshot.isDragging ? 'ring-2 ring-blue-500' : ''}`}
                            >
                              {/* 使用 loading="lazy" 延迟加载图片 */}
                              <div className="flex flex-row">
                                <div className="w-32 sm:w-48 h-48 sm:h-72 flex-shrink-0 overflow-hidden">
                                  <img
                                    src={favorite.poster}
                                    alt={favorite.title}
                                    className="w-full h-full object-contain"
                                    onClick={() => navigate(`/${favorite.media_type}/${favorite.media_id}`)}
                                    loading="lazy"
                                  />
                                </div>
                                
                                {/* 内容信息 */}
                                <div className="flex-1 p-3 sm:p-6 relative flex flex-col">
                                  {/* 列表模式下的按钮 */}
                                  {isOwner && !list.original_list_id && (
                                    <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex gap-1 sm:gap-2">
                                      {/* 编辑备注按钮 */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingFavorite(favorite);
                                          setShowNoteDialog(true);
                                        }}
                                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full 
                                          bg-black/50 text-white hover:bg-black/70 
                                          transition-colors"
                                      >
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                      </button>
                                      
                                      {/* 删除按钮 */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveFavorite(favorite.id);
                                        }}
                                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full 
                                          bg-black/50 text-white hover:bg-black/70 
                                          transition-colors"
                                      >
                                        <span className="text-lg sm:text-xl leading-none">×</span>
                                      </button>
                                    </div>
                                  )}
                                  
                                  <div className="flex-grow">
                                    <div className="flex items-baseline gap-3 mb-2">
                                      <h2 className="text-xl font-bold dark:text-white">
                                        {favorite.title}
                                      </h2>
                                      <span className="text-black dark:text-white">
                                        {favorite.year}
                                      </span>
                                    </div>
                                    
                                    <p className="text-gray-600 dark:text-gray-300 line-clamp-4 sm:line-clamp-[7]">
                                      {favorite.overview}
                                    </p>
                                  </div>

                                  {favorite.note && (
                                    <div className="mt-4 p-3 bg-gray-400 dark:bg-gray-700 rounded-lg">
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
                      ))
                    ) : (
                      // 网格模式 - 使用 CSS Grid 和延迟加载
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {sortedFavorites.map((favorite, index) => (
                          <Draggable
                            key={`favorite-${favorite.id}`}
                            draggableId={`favorite-${favorite.id}`}
                            index={index}
                            isDragDisabled={sortType !== 'custom_edit' || !isOwner || !!list.original_list_id}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`relative group ${snapshot.isDragging ? 'z-50' : ''}`}
                              >
                                <div 
                                  className={`
                                    relative cursor-pointer
                                    ${snapshot.isDragging ? 'ring-2 ring-blue-500 rounded-lg' : ''}
                                  `}
                                  onClick={() => {
                                    if (sortType !== 'custom_edit') {
                                      navigate(`/detail/${favorite.media_type}/${favorite.media_id}`);
                                    }
                                  }}
                                >
                                  <div className="aspect-[2/3] rounded-lg overflow-hidden">
                                    <img
                                      src={favorite.poster}
                                      alt={favorite.title}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  </div>
                                  {isOwner && !list.original_list_id && (
                                    <div className="absolute top-1 sm:top-2 left-1 sm:left-2 flex gap-1 sm:gap-2">
                                      {/* 编辑备注按钮 */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingFavorite(favorite);
                                          setShowNoteDialog(true);
                                        }}
                                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full 
                                          bg-black/50 text-white hover:bg-black/70 
                                          transition-colors"
                                      >
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                      </button>
                                      
                                      {/* 删除按钮 */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveFavorite(favorite.id);
                                        }}
                                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full 
                                          bg-black/50 text-white hover:bg-black/70 
                                          transition-colors"
                                      >
                                        <span className="text-lg sm:text-xl leading-none">×</span>
                                      </button>
                                    </div>
                                  )}
                                  <div className="mt-2">
                                    <h3 className="text-sm font-medium dark:text-white truncate">
                                      {favorite.title}
                                    </h3>
                                    <p className="text-xs text-black dark:text-white">
                                      {favorite.year}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </StrictModeDroppable>
            </DragDropContext>
          )}
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

        <Dialog
          open={showNoteDialog}
          onClose={() => {
            setShowNoteDialog(false);
            setEditingFavorite(null);
          }}
          title="编辑备注"
        >
          {editingFavorite && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">{editingFavorite.title}</h3>
                <Textarea
                  label="备注"
                  value={editingFavorite.note || ''}
                  onChange={(e) => setEditingFavorite({
                    ...editingFavorite,
                    note: e.target.value
                  })}
                  placeholder="添加你的观影感受..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNoteDialog(false);
                    setEditingFavorite(null);
                  }}
                >
                  取消
                </Button>
                <Button onClick={handleUpdateNote}>
                  保存
                </Button>
              </div>
            </div>
          )}
        </Dialog>

        <Footer />
      </div>
    </>
  );
}