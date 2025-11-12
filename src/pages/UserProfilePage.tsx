// ==========================================
// 用户主页 - 查看其他用户的资料和公开收藏列表
// ==========================================
import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../components/auth/AuthContext';
import { ThemeToggle } from '../utils/ThemeToggle';
import { toast } from "sonner";
import { AuthModal } from '../components/auth/AuthModal';
import { NavBar } from '../utils/NavBar';
import { ScrollToTopButton } from '../utils/ScrollToTopButton';

interface Creator {
  id: number;
  username: string;
  avatar: string;
  email: string;
  is_following?: boolean;
}

interface FavoriteList {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  favorites: Favorite[];
  is_collected: boolean;
  created_at: string;
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

// 页脚组件
const Footer = () => (
  <div className="w-full py-6 mt-8 flex justify-center items-center gap-2">
    <a 
      href="https://weibo.com/u/2238200645" 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-black-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
    >
      <img src="/logos/weibo.png" alt="微博" className="w-5 h-5" />
      <span>守望电影</span>
    </a>
  </div>
);

export default function UserProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [userInfo, setUserInfo] = useState<Creator | null>(null);
  const [lists, setLists] = useState<FavoriteList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (userInfo) {
      document.title = `${userInfo.username} - RateFuse`;
    } else {
      document.title = '用户主页 - RateFuse';
    }
  }, [userInfo]);

  useEffect(() => {
    // 创建一个状态标志，防止组件卸载后设置状态
    let isMounted = true;
    
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setIsLoading(true);
        const timestamp = new Date().getTime();
        
        // 并行发起请求
        const [userResponse, listsResponse] = await Promise.all([
          fetch(`/api/users/${id}?_=${timestamp}`, {
            headers: user ? {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            } : undefined,
            cache: 'no-store'
          }),
          fetch(`/api/users/${id}/favorite-lists`, {
            headers: user ? {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            } : undefined
          })
        ]);
        
        // 并行处理响应
        const [userData, listsData] = await Promise.all([
          userResponse.ok ? userResponse.json() : null,
          listsResponse.ok ? listsResponse.json() : []
        ]);
        
        // 确保组件仍然挂载
        if (isMounted) {
          if (userData) setUserInfo(userData);
          if (listsData) setLists(listsData);
          
          // 预加载列表中的图片
          if (listsData && Array.isArray(listsData)) {
            listsData.forEach(list => {
              if (list.favorites && Array.isArray(list.favorites)) {
                list.favorites.slice(0, 5).forEach((favorite: { poster: string }) => {
                  const img = new Image();
                  img.src = favorite.poster;
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('获取数据失败:', error);
        if (isMounted) {
          toast.error('获取数据失败');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    fetchData();
    
    // 清理函数
    return () => {
      isMounted = false;
    };
  }, [id, user]);

  const handleCollectList = async (listId: number) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      // 检查列表是否已收藏
      const isCollected = lists.find(list => list.id === listId)?.is_collected;
      
      if (isCollected) {
        // 如果已收藏，则取消收藏
        const response = await fetch(`/api/favorite-lists/${listId}/uncollect`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          toast.success('取消收藏成功');
          // 更新列表状态
          setLists(lists.map(list => 
            list.id === listId ? { ...list, is_collected: false } : list
          ));
        } else {
          throw new Error('取消收藏失败');
        }
      } else {
        // 如果未收藏，则收藏
        const response = await fetch(`/api/favorite-lists/${listId}/collect`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          toast.success('收藏成功');
          // 更新列表状态
          setLists(lists.map(list => 
            list.id === listId ? { ...list, is_collected: true } : list
          ));
          // 不再跳转到列表详情页
        } else {
          throw new Error('收藏失败');
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const handleFollow = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (!userInfo) {
      toast.error('用户信息不存在');
      return;
    }

    try {
      // 先获取当前的关注状态
      const isCurrentlyFollowing = userInfo.is_following;

      // 立即更新UI状态，提供即时反馈
      setUserInfo(prev => {
        if (!prev) return null;
        return {
          ...prev,
          is_following: !isCurrentlyFollowing
        };
      });

      const response = await fetch(`/api/users/${userInfo.id}/follow`, {
        method: isCurrentlyFollowing ? 'DELETE' : 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const responseData = await response.json();

      // 如果请求失败，恢复原来的状态
      if (!response.ok) {
        setUserInfo(prev => {
          if (!prev) return null;
          return {
            ...prev,
            is_following: isCurrentlyFollowing
          };
        });
        
        throw new Error(responseData.detail || '操作失败');
      }

      // 请求成功，显示成功消息
      toast.success(isCurrentlyFollowing ? '取消关注成功' : '关注成功');
      
      // 强制重新获取用户信息，确保状态一致
      setTimeout(() => {
        const getUserInfo = async () => {
          try {
            const timestamp = new Date().getTime();
            const response = await fetch(`/api/users/${id}?_=${timestamp}`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              cache: 'no-store'
            });
            
            if (response.ok) {
              const data = await response.json();
              setUserInfo(data);
            }
          } catch (error) {
            toast.error('重新获取用户信息失败');
          }
        };
        
        getUserInfo();
      }, 500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const useElementSize = () => {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const elementRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!elementRef.current) return;

      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setSize({ width, height });
        }
      });

      observer.observe(elementRef.current);
      return () => observer.disconnect();
    }, []);

    return { elementRef, ...size };
  };

  const FavoriteListCard = memo(({ list }: { list: FavoriteList }) => {
    const { elementRef, width } = useElementSize();
    const posterWidth = width < 300 ? 80 : 100;
    const posterGap = width < 300 ? 20 : 30;
    const rightMargin = 4;

    // 使用 useMemo 缓存计算结果
    const getSortedFavorites = useMemo(() => {
      if (!list.favorites || !Array.isArray(list.favorites)) return [];
      
      if (list.favorites.some(f => f.sort_order !== null)) {
        return [...list.favorites].sort((a, b) => 
          (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
        );
      }
      return [...list.favorites].sort((a, b) => a.id - b.id);
    }, [list.favorites]);

    // 使用 useMemo 缓存计算结果
    const calculatePostersToShow = useCallback((containerWidth: number) => {
      if (containerWidth <= 0) return 0;
      const availableWidth = containerWidth - rightMargin;
      return Math.max(2, Math.floor((availableWidth - posterWidth) / posterGap) + 1);
    }, [posterWidth, posterGap, rightMargin]);

    const postersToShow = useMemo(() => 
      width > 0 ? calculatePostersToShow(width) : 0, 
      [width, calculatePostersToShow]
    );
    
    const favoritesToShow = useMemo(() => 
      getSortedFavorites.slice(0, postersToShow), 
      [getSortedFavorites, postersToShow]
    );

    return (
      <div ref={elementRef} className="text-white rounded-lg p-4 bg-[#9a9cc9] shadow-sm hover:shadow-md transition-shadow">
        <div className="flex flex-col h-full">
        {/* 海报堆叠展示区域 */}
        <Link 
            to={`/favorite-lists/${list.id}`}
            className="relative h-[160px] flex items-center mt-auto cursor-pointer"
          >
            {width > 0 && favoritesToShow.map((favorite, index) => (
              <div
                key={favorite.id}
                className="absolute"
                style={{
                  left: `${index * posterGap}px`,
                  zIndex: postersToShow - index,
                  filter: `brightness(${100 - (postersToShow - index - 1) * 1.5}%)`,
                }}
              >
                <div 
                  className={`
                    ${width < 300 ? 'w-[80px] h-[120px]' : 'w-[100px] h-[150px]'}
                    rounded-lg overflow-hidden
                    relative
                    before:content-['']
                    before:absolute
                    before:inset-0
                    before:z-10
                    before:shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]
                    before:pointer-events-none
                  `}
                  style={{
                    boxShadow: index === 0 
                      ? `0 4px 6px rgba(0,0,0,0.2), 0 6px 10px rgba(0,0,0,0.15), inset 0 0 2px rgba(0,0,0,0.2)`
                      : index === 1
                      ? `0 3px 5px rgba(0,0,0,0.18), 0 5px 8px rgba(0,0,0,0.12), inset 0 0 2px rgba(0,0,0,0.2)`
                      : `${4 + index}px ${4 + index}px 6px rgba(0,0,0,0.15), 0 ${2 + index}px ${4 + index}px rgba(0,0,0,0.1), inset 0 0 2px rgba(0,0,0,0.2)`,
                    transform: index < 2 ? `translateY(-${2 - index}px)` : 'none'
                  }}
                >
                  <div 
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{
                      background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.2) 100%)`
                    }}
                  />
                  <div 
                    className="absolute inset-0 z-20 pointer-events-none rounded-lg"
                    style={{
                      boxShadow: index < 2
                        ? 'inset 0 1px 4px rgba(0,0,0,0.25), inset 0 0 2px rgba(0,0,0,0.15)'
                        : 'inset 0 1px 3px rgba(0,0,0,0.2), inset 0 0 2px rgba(0,0,0,0.1)'
                    }}
                  />
                  <img
                    src={favorite.poster}
                    alt={favorite.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
            {getSortedFavorites.length > postersToShow && (
              <div 
                className="absolute flex items-center justify-center text-gray-500"
                style={{
                  left: `${postersToShow * posterGap + 10}px`,
                  zIndex: 0
                }}
              >
                +{getSortedFavorites.length - postersToShow}
              </div>
            )}
          </Link>

          {/* 列表信息 */}
          <div className="mb-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium truncate">
                  <Link to={`/favorite-lists/${list.id}`} className="hover:text-blue-500">
                    {list.name}
                  </Link>
                </h3>
                {!list.is_public && (
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
              </div>
              {list.is_public && user?.id !== parseInt(id!) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCollectList(list.id);
                  }}
                  className={`p-2 transition-colors ${
                    list.is_collected 
                      ? "text-blue-500 hover:text-gray-500" 
                      : "text-gray-500 hover:text-blue-600"
                  }`}
                  title={list.is_collected ? "取消收藏" : "收藏列表"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              )}
            </div>
            {list.description && (
              <p className="text-gray-700 text-sm mt-1 line-clamp-2">{list.description}</p>
            )}
            <p className="text-sm text-gray-700 mt-1">
              {list.favorites.length} 部作品
            </p>
            <p className="text-sm text-gray-700">
              {new Date(list.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    );
  });

  if (isLoading) {
    return (
      <>
        <NavBar />
        <div className="min-h-screen bg-gradient-to-b from-blue-400 to-indigo-600 pt-16 p-4">
          <ThemeToggle />
          <ScrollToTopButton />
          
          <div className="max-w-4xl mx-auto">
            {/* 用户信息骨架屏 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                <div className="space-y-2">
                  <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-32"></div>
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-48"></div>
                </div>
              </div>
            </div>
            
            {/* 列表骨架屏 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-24 mb-6"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="rounded-lg p-4 bg-gray-300 dark:bg-gray-600 h-64 animate-pulse"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!userInfo) {
    return <div>未找到该用户</div>;
  }

  return (
    <>
      <NavBar />
      <div className="min-h-screen bg-gradient-to-b from-blue-400 to-indigo-600 pt-16 p-4">
        <ThemeToggle />
        <ScrollToTopButton />

        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
        />
        
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full overflow-hidden">
                <img
                  src={userInfo.avatar || '/default-avatar.png'}
                  alt={userInfo.username}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold dark:text-white">{userInfo.username}</h1>
                {user?.id === parseInt(id!) && (
                  <p className="text-gray-600 dark:text-gray-300">{userInfo.email}</p>
                )}
              </div>
              {(!user || user.id !== parseInt(id!)) && (
                <button
                  onClick={handleFollow}
                  className={`
                    px-4 py-2 rounded-full
                    ${user && userInfo.is_following
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      : 'bg-blue-500 text-white'}
                    hover:opacity-80 transition-opacity
                  `}
                >
                  {user && userInfo.is_following ? '取消关注' : '关注'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold dark:text-white">片单</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {lists.filter(list => list.is_public || user?.id === parseInt(id!)).map(list => (
                <FavoriteListCard key={list.id} list={list} />
              ))}
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
} 
