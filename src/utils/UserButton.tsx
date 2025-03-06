// ==========================================
// 用户按钮
// ==========================================
import { useState } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { AuthModal } from '../components/auth/AuthModal';
import { useNavigate } from 'react-router-dom';

export function UserButton() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
    <>
      <div className="absolute top-2 sm:top-3 right-2 sm:right-2 z-30">
        <button
          onClick={handleClick}
          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full overflow-hidden bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
          aria-label={user ? '个人中心' : '登录'}
        >
          <img 
            src={user?.avatar || '/Profile.png'} 
            alt="用户头像"
            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full"
          />
        </button>

        {user && showDropdown && (
          <div className="absolute right-0 mt-2 w-36 sm:w-48 rounded-lg shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5">
            <div className="py-1">
              <button
                onClick={() => {
                  navigate('/profile');
                  setShowDropdown(false);
                }}
                className="block w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                个人中心
              </button>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                退出登录
              </button>
            </div>
          </div>
        )}
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </>
  );
}