// ==========================================
// 用户按钮
// ==========================================
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { AuthModal } from '../components/auth/AuthModal';
import { useNavigate } from 'react-router-dom';

export function UserButton() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
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
          className="absolute right-0 mt-2 w-32 rounded-lg shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
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
              onClick={handleLogout}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              退出登录
            </button>
          </div>
        </div>
      )}

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}
