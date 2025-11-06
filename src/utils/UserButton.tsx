// ==========================================
// 用户按钮组件 - 用户登录/个人中心入口
// ==========================================
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { AuthModal } from '../components/auth/AuthModal';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../components/ui/Dialog';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';
import { toast } from 'sonner';

export function UserButton() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCookieDialog, setShowCookieDialog] = useState(false);
  const [cookieValue, setCookieValue] = useState('');
  const [hasCookie, setHasCookie] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleClick = () => {
    if (user) {
      setShowDropdown(!showDropdown);
    } else {
      setShowAuthModal(true);
    }
  };

  const handleLogout = () => {
    logout();
    setShowDropdown(false);
  };

  // 检查用户是否已设置Cookie
  useEffect(() => {
    if (user) {
      fetch('/api/user/douban-cookie', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
        .then(res => res.json())
        .then(data => {
          setHasCookie(data.has_cookie || false);
        })
        .catch(() => {
          // 忽略错误
        });
    }
  }, [user]);

  const handleOpenCookieDialog = () => {
    setShowCookieDialog(true);
    setShowDropdown(false);
  };

  const handleSaveCookie = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/douban-cookie', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cookie: cookieValue })
      });

      if (response.ok) {
        const data = await response.json();
        setHasCookie(data.has_cookie);
        toast.success(data.message || '豆瓣Cookie保存成功');
        setShowCookieDialog(false);
        setCookieValue('');
      } else {
        const error = await response.json();
        toast.error(error.detail || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败，请重试');
    }
  };

  const handleClearCookie = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/douban-cookie', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cookie: '' })
      });

      if (response.ok) {
        const data = await response.json();
        setHasCookie(data.has_cookie);
        toast.success(data.message || '豆瓣Cookie已清除');
        setShowCookieDialog(false);
        setCookieValue('');
      } else {
        const error = await response.json();
        toast.error(error.detail || '清除失败');
      }
    } catch (error) {
      toast.error('清除失败，请重试');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className="w-7 h-7 flex items-center justify-center rounded-full overflow-hidden bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 hover:scale-110"
        aria-label={user ? '个人中心' : '登录'}
      >
        <img 
          src={user?.avatar || '/Profile.png'} 
          alt="用户头像"
          className="w-5 h-5 rounded-full"
        />
      </button>

      {user && showDropdown && (
        <div 
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-40 rounded-lg shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
        >
          <div className="py-1">
            <button
              onClick={() => {
                navigate('/profile');
                setShowDropdown(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              个人中心
            </button>
            <button
              onClick={handleOpenCookieDialog}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {hasCookie ? '✓ 豆瓣Cookie' : '设置豆瓣Cookie'}
            </button>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              退出登录
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={showCookieDialog}
        onClose={() => {
          setShowCookieDialog(false);
          setCookieValue('');
        }}
        title="设置豆瓣Cookie"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2 font-medium">获取Cookie的流程：</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>打开浏览器，访问 <span className="font-mono text-xs">douban.com</span> 并登录</li>
              <li>按 <span className="font-mono text-xs">F12</span> 或右键选择"检查"打开开发者工具</li>
              <li>切换到 <span className="font-mono text-xs">Network</span>（网络）标签</li>
              <li>刷新页面，找到以 <span className="font-mono text-xs">douban.com</span> 结尾的请求</li>
              <li>点击该请求，在 <span className="font-mono text-xs">Headers</span>（请求头）中找到 <span className="font-mono text-xs">Cookie</span> 字段</li>
              <li>复制完整的Cookie值（从第一个键值对到最后一个）并粘贴到下方</li>
            </ol>
            <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono break-all">
              <p className="text-gray-500 dark:text-gray-400 mb-1">Cookie示例格式：</p>
              <p className="text-gray-700 dark:text-gray-300">bid=xxx; dbcl2="xxx"; ck=xxx; ...</p>
            </div>
          </div>
          
          <Textarea
            placeholder="粘贴您的豆瓣Cookie（例如：bid=xxx; dbcl2=xxx; ...）"
            value={cookieValue}
            onChange={(e) => setCookieValue(e.target.value)}
            className="text-sm min-h-[80px]"
            rows={3}
          />
          
          <div className="flex gap-2">
            <Button
              onClick={handleSaveCookie}
              className="flex-1"
              disabled={!cookieValue.trim()}
            >
              保存
            </Button>
            {hasCookie && (
              <Button
                onClick={handleClearCookie}
                variant="outline"
                className="flex-1"
              >
                清除
              </Button>
            )}
            <Button
              onClick={() => {
                setShowCookieDialog(false);
                setCookieValue('');
              }}
              variant="outline"
            >
              取消
            </Button>
          </div>
          
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            建议每7-14天更换一次Cookie，以确保正常使用
          </p>
        </div>
      </Dialog>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}
