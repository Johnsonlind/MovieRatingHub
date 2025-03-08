// ==========================================
// 个人中心页
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { getBase64Image } from '../api/image';
import { ThemeToggle } from '../utils/ThemeToggle';
import { NavBar } from '../utils/NavBar';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { toast } from "sonner";
import { ScrollToTopButton } from '../utils/ScrollToTopButton';

interface Creator {
  id: number;
  username: string;
  avatar: string;
  is_following?: boolean;
}

interface Favorite {
  id: number;
  media_id: string;
  media_type: string;
  title: string;
  poster: string;
  year: string;
  overview: string;
  sort_order?: number | null;
}

interface FavoriteList {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at?: string;
  favorites: Favorite[];
  original_list_id?: number;
  original_creator?: Creator;
  creator?: Creator;
}

interface ProfileFormData {
  username: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// 添加关注用户接口
interface Following {
  id: number;
  username: string;
  avatar: string;
  note: string | null;
  created_at: string;
}

// 添加一个自定义 Hook 来获取当前屏幕尺寸
const useScreenSize = () => {
  const [screenSize, setScreenSize] = useState({
    isMobile: window.innerWidth < 640,
    isTablet: window.innerWidth >= 640 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024
  });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        isMobile: window.innerWidth < 640,
        isTablet: window.innerWidth >= 640 && window.innerWidth < 1024,
        isDesktop: window.innerWidth >= 1024
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return screenSize;
};

// 添加一个自定义 Hook 来监测元素大小
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

export default function ProfilePage() {
  const { user, isLoading, updateUserInfo, logout } = useAuth();
  const navigate = useNavigate();
  const [, setFavorites] = useState<Favorite[]>([]);
  const [, setIsLoadingFavorites] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    username: user?.username || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [lists, setLists] = useState<FavoriteList[]>([]);
  const [editingList, setEditingList] = useState<FavoriteList | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newList, setNewList] = useState({
    name: '',
    description: '',
    is_public: false
  });
  const [activeTab, setActiveTab] = useState<'collections' | 'following'>('collections');
  const [following, setFollowing] = useState<Following[]>([]);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [editingFollow, setEditingFollow] = useState<Following | null>(null);
  useScreenSize();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const response = await fetch('/api/favorites', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setFavorites(data);
        }
      } catch (error) {
        console.error('获取收藏列表失败:', error);
      } finally {
        setIsLoadingFavorites(false);
      }
    };

    if (user) {
      fetchFavorites();
    }
  }, [user]);

  useEffect(() => {
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
        }
      } catch (error) {
        console.error('获取收藏列表失败:', error);
      }
    };

    if (user) {
      fetchLists();
    }
  }, [user]);

  useEffect(() => {
    const fetchFollowing = async () => {
      try {
        const response = await fetch('/api/users/me/following', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setFollowing(data);
        }
      } catch (error) {
        console.error('获取关注列表失败:', error);
      }
    };

    if (user) {
      fetchFollowing();
    }
  }, [user]);

  // 处理头像上传
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await getBase64Image(file);
      setPreviewAvatar(base64);
      
      // 直接更新头像
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          avatar: base64
        })
      });

      if (!response.ok) {
        throw new Error('头像更新失败');
      }

      const data = await response.json();
      updateUserInfo(data.user);
      setSuccess('头像更新成功');
    } catch (error) {
      console.error('头像处理失败:', error);
      setError('头像上传失败');
    }
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const updateData: any = {};
      
      if (formData.username !== user?.username) {
        updateData.username = formData.username;
      }

      if (previewAvatar) {
        updateData.avatar = previewAvatar;
      }

      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          setError('两次输入的新密码不一致');
          return;
        }
        updateData.password = formData.newPassword;
      }

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updateData)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || '更新失败');
      }

      updateUserInfo(data.user);
      setSuccess('个人资料更新成功');
      setIsEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : '更新失败');
    }
  };

  const handleEditList = async (list: FavoriteList) => {
    try {
      const response = await fetch(`/api/favorite-lists/${list.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: list.name,
          description: list.description,
          is_public: list.is_public
        })
      });

      if (response.ok) {
        const updatedList = await response.json();
        setLists(lists.map(l => l.id === updatedList.id ? updatedList : l));
        setShowEditDialog(false);
        setEditingList(null);
      }
    } catch (error) {
      console.error('更新收藏列表失败:', error);
    }
  };

  const handleDeleteList = async (listId: number) => {
    if (!confirm('确定要删除这个收藏列表吗？')) return;

    try {
      const response = await fetch(`/api/favorite-lists/${listId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setLists(lists.filter(l => l.id !== listId));
      }
    } catch (error) {
      console.error('删除收藏列表失败:', error);
    }
  };

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
        const createdList = await response.json();
        setLists([...lists, createdList]);
        setShowCreateDialog(false);
        setNewList({ name: '', description: '', is_public: false });
      }
    } catch (error) {
      console.error('创建收藏列表失败:', error);
    }
  };

  // 收藏列表卡片组件
  const FavoriteListCard = ({ list }: { list: FavoriteList }) => {
    const { elementRef, width } = useElementSize();
    const posterWidth = width < 300 ? 80 : 100;
    const posterGap = width < 300 ? 20 : 30;
    const rightMargin = 4;

    // 获取排序后的收藏
    const getSortedFavorites = (favorites: Favorite[]) => {
      if (favorites.some(f => f.sort_order !== null)) {
        // 使用自定义排序
        return [...favorites].sort((a, b) => 
          (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
        );
      }
      // 默认按最早添加时间排序
      return [...favorites].sort((a, b) => a.id - b.id);
    };

    const calculatePostersToShow = (containerWidth: number) => {
      if (containerWidth <= 0) return 0;
      const availableWidth = containerWidth - rightMargin;
      return Math.max(2, Math.floor((availableWidth - posterWidth) / posterGap) + 1);
    };

    const postersToShow = width > 0 ? calculatePostersToShow(width) : 0;
    const sortedFavorites = getSortedFavorites(list.favorites);
    const favoritesToShow = sortedFavorites.slice(0, postersToShow);

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
                      ? `
                        0 4px 6px rgba(0,0,0,0.2),
                        0 6px 10px rgba(0,0,0,0.15),
                        inset 0 0 2px rgba(0,0,0,0.2)
                      `
                      : index === 1
                      ? `
                        0 3px 5px rgba(0,0,0,0.18),
                        0 5px 8px rgba(0,0,0,0.12),
                        inset 0 0 2px rgba(0,0,0,0.2)
                      `
                      : `
                        ${4 + index}px ${4 + index}px 6px rgba(0,0,0,0.15),
                        0 ${2 + index}px ${4 + index}px rgba(0,0,0,0.1),
                        inset 0 0 2px rgba(0,0,0,0.2)
                      `,
                    transform: index < 2 ? `translateY(-${2 - index}px)` : 'none'
                  }}
                >
                  {/* 渐变遮罩层 */}
                  <div 
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{
                      background: `
                        linear-gradient(
                          to bottom,
                          rgba(0,0,0,0.1) 0%,
                          rgba(0,0,0,0) 20%,
                          rgba(0,0,0,0) 80%,
                          rgba(0,0,0,0.2) 100%
                        )
                      `
                    }}
                  />

                  {/* 内部边缘阴影 */}
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
            {sortedFavorites.length > postersToShow && (
              <div 
                className="absolute flex items-center justify-center text-gray-500"
                style={{
                  left: `${postersToShow * posterGap + 10}px`,
                  zIndex: 0
                }}
              >
                +{sortedFavorites.length - postersToShow}
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
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                    />
                  </svg>
                )}
              </div>
            </div>
            {list.description && (
              <p className="text-gray-700 text-sm mt-1 line-clamp-2">
                {list.description}
              </p>
            )}
            <p className="text-sm text-gray-700 mt-1">
              {list.favorites.length} 部作品
            </p>
            <p className="text-sm text-gray-700">
              {new Date(list.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* 底部信息区域 */}
          <div className="mt-4 flex justify-between items-end">
            {/* 创建者信息 */}
            <div className="flex items-center gap-2">
              {list.original_list_id && list.original_creator ? (
                // 显示原创者信息
                <>
                  <img
                    src={list.original_creator?.avatar || '/default-avatar.png'}
                    alt={list.original_creator?.username}
                    className="w-6 h-6 rounded-full object-cover cursor-pointer"
                    onClick={() => navigate(`/profile/${list.original_creator?.id}`)}
                  />
                  <span 
                    className="text-sm text-gray-700 cursor-pointer hover:text-blue-500"
                    onClick={() => navigate(`/profile/${list.original_creator?.id}`)}
                  >
                    {list.original_creator?.username}
                  </span>
                </>
              ) : (
                // 显示当前用户信息
                <>
                  <img
                    src={user?.avatar || '/default-avatar.png'}
                    alt={user?.username}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <span className="text-sm text-gray-700">
                    {user?.username}
                  </span>
                </>
              )}
            </div>
            
            {/* 编辑、删除和分享按钮 */}
            <div className="flex gap-1">
              {list.is_public && (
                <button
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/favorite-lists/${list.id}`;
                    navigator.clipboard.writeText(shareUrl)
                      .then(() => {
                        toast.success("链接已复制到剪贴板");
                      })
                      .catch(() => {
                        toast.error("复制链接失败");
                      });
                  }}
                  className="p-1 text-gray-500 hover:text-blue-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => {
                  setEditingList(list);
                  setShowEditDialog(true);
                }}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button
                onClick={() => handleDeleteList(list.id)}
                className="p-1 text-gray-500 hover:text-red-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 取消关注处理函数
  const handleUnfollow = async (userId: number) => {
    try {
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setFollowing(following.filter(f => f.id !== userId));
        toast.success('取消关注成功');
      }
    } catch (error) {
      console.error('取消关注失败:', error);
      toast.error('操作失败');
    }
  };

  // 更新备注处理函数
  const handleUpdateNote = async () => {
    if (!editingFollow) return;

    try {
      const response = await fetch(`/api/users/${editingFollow.id}/follow/note`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          note: editingFollow.note
        })
      });

      if (response.ok) {
        setFollowing(following.map(f =>
          f.id === editingFollow.id ? editingFollow : f
        ));
        setShowNoteDialog(false);
        setEditingFollow(null);
        toast.success('更新备注成功');
      }
    } catch (error) {
      console.error('更新备注失败:', error);
      toast.error('操作失败');
    }
  };

  if (isLoading || !user) {
    return <div>加载中...</div>;
  }

  return (
    <>
      <NavBar />
      <div className="min-h-screen bg-gradient-to-b from-blue-400 to-indigo-600 pt-16 p-4">
        <ThemeToggle />
        <ScrollToTopButton />
        
        <div className="max-w-4xl mx-auto">
          {/* 个人资料卡片 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
            <form onSubmit={handleSubmit}>
              <div className="flex items-center gap-6">
                {/* 头像区域 */}
                <div className="relative">
                  <img
                    src={previewAvatar || user?.avatar || '/Profile.png'}
                    alt="用户头像"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
                
                {/* 用户信息 */}
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          用户名
                        </label>
                        <input
                          type="text"
                          value={formData.username}
                          onChange={(e) => setFormData({...formData, username: e.target.value})}
                          className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 
                            bg-white dark:bg-gray-700 
                            shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 
                            text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          新密码
                        </label>
                        <input
                          type="password"
                          value={formData.newPassword}
                          onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
                          className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 
                            bg-white dark:bg-gray-700 
                            shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 
                            text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          确认新密码
                        </label>
                        <input
                          type="password"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                          className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 
                            bg-white dark:bg-gray-700 
                            shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 
                            text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      {error && (
                        <p className="text-red-500 text-sm">{error}</p>
                      )}
                      {success && (
                        <p className="text-green-500 text-sm">{success}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-2xl font-bold dark:text-white mb-2">{user?.username}</h1>
                      <p className="text-gray-600 dark:text-gray-300">{user?.email}</p>
                      <div className="mt-4 flex gap-4 items-center">
                        <button
                          type="button"
                          onClick={() => setIsEditing(true)}
                          className="text-blue-500 hover:text-blue-600"
                        >
                          编辑个人资料
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('确定要退出登录吗？')) {
                              logout();
                              navigate('/');
                            }
                          }}
                          className="text-red-500 hover:text-red-600"
                        >
                          退出登录
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* 收藏内容区域 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('collections')}
                  className={`text-xl font-semibold ${
                    activeTab === 'collections'
                      ? 'text-blue-500 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  我的收藏
                </button>
                <button
                  onClick={() => setActiveTab('following')}
                  className={`text-xl font-semibold ${
                    activeTab === 'following'
                      ? 'text-blue-500 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  我的关注
                </button>
              </div>
              {activeTab === 'collections' && (
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="创建收藏列表"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            
            {activeTab === 'collections' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {lists.map(list => (
                  <FavoriteListCard key={list.id} list={list} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {following.map(follow => (
                  <div key={follow.id} className="bg-[#9a9cc9] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <img
                        src={follow.avatar || '/default-avatar.png'}
                        alt={follow.username}
                        className="w-12 h-12 rounded-full object-cover cursor-pointer"
                        onClick={() => navigate(`/profile/${follow.id}`)}
                      />
                      <div className="flex-1">
                        <h3 
                          className="text-lg font-medium dark:text-white cursor-pointer hover:text-blue-500"
                          onClick={() => navigate(`/profile/${follow.id}`)}
                        >
                          {follow.username}
                        </h3>
                        {follow.note && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {follow.note}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingFollow(follow);
                            setShowNoteDialog(true);
                          }}
                          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleUnfollow(follow.id)}
                          className="p-2 text-gray-500 hover:text-red-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <Dialog
          open={showEditDialog}
          onClose={() => {
            setShowEditDialog(false);
            setEditingList(null);
          }}
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
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingList(null);
                  }}
                >
                  取消
                </Button>
                <Button onClick={() => handleEditList(editingList)}>
                  保存
                </Button>
              </div>
            </div>
          )}
        </Dialog>

        <Dialog
          open={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            setNewList({ name: '', description: '', is_public: false });
          }}
          title="创建收藏列表"
        >
          <div className="space-y-4">
            <Input
              label="列表名称"
              value={newList.name}
              onChange={(e) => setNewList({
                ...newList,
                name: e.target.value
              })}
              placeholder="请输入列表名称"
            />
            <Textarea
              label="列表描述（可选）"
              value={newList.description}
              onChange={(e) => setNewList({
                ...newList,
                description: e.target.value
              })}
              placeholder="添加一些描述..."
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={newList.is_public}
                onCheckedChange={(checked) => setNewList({
                  ...newList,
                  is_public: checked
                })}
              />
              <span>公开列表</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewList({ name: '', description: '', is_public: false });
                }}
              >
                取消
              </Button>
              <Button 
                onClick={handleCreateList}
                disabled={!newList.name.trim()}
              >
                创建
              </Button>
            </div>
          </div>
        </Dialog>

        {/* 添加备注对话框 */}
        <Dialog
          open={showNoteDialog}
          onClose={() => {
            setShowNoteDialog(false);
            setEditingFollow(null);
          }}
          title="编辑备注"
        >
          {editingFollow && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">{editingFollow.username}</h3>
                <Textarea
                  label="备注"
                  value={editingFollow.note || ''}
                  onChange={(e) => setEditingFollow({
                    ...editingFollow,
                    note: e.target.value
                  })}
                  placeholder="添加备注..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNoteDialog(false);
                    setEditingFollow(null);
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
      </div>
    </>
  );
} 
