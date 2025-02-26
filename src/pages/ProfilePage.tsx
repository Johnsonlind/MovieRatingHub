import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { getBase64Image } from '../lib/utils/image';
import { ThemeToggle } from '../components/ThemeToggle';
import { SearchButton } from '../components/SearchButton';
import { HomeButton } from '../components/HomeButton';

interface Favorite {
  id: number;
  media_id: string;
  media_type: string;
  title: string;
  poster: string;
  year: string;
}

interface ProfileFormData {
  username: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ProfilePage() {
  const { user, isLoading, updateUserInfo } = useAuth();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);
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

  if (isLoading || !user) {
    return <div>加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-indigo-600 p-4">
      <ThemeToggle />
      <SearchButton />
      <HomeButton />
      
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
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="mt-4 text-blue-500 hover:text-blue-600"
                    >
                      编辑个人资料
                    </button>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* 收藏内容区域 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold mb-6 dark:text-white">我的收藏</h2>
          {isLoadingFavorites ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : favorites.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">暂无收藏内容</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {favorites.map((favorite) => (
                <div 
                  key={favorite.id}
                  className="group cursor-pointer"
                  onClick={() => navigate(`/${favorite.media_type}/${favorite.media_id}`)}
                >
                  <div className="relative overflow-hidden rounded-lg">
                    <img
                      src={favorite.poster}
                      alt={favorite.title}
                      className="w-full aspect-[2/3] object-cover transform transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-sm dark:text-gray-300 truncate">{favorite.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">({favorite.year})</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
