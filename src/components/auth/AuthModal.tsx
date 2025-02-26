import { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { useAuth } from '../../contexts/AuthContext';
import { X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const { login, register, sendPasswordResetEmail } = useAuth();

  useEffect(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    setIsDark(theme === 'dark');

    // 监听主题变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newTheme = document.documentElement.getAttribute('data-theme');
          setIsDark(newTheme === 'dark');
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email, password, rememberMe);
      } else {
        await register(email, username, password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('请输入邮箱地址');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setError('');
    setIsLoading(true);
    
    try {
      await sendPasswordResetEmail(email);
      alert('重置密码链接已发送到您的邮箱，请查收。\n如果没有收到，请检查垃圾邮件文件夹。');
      onClose();
    } catch (err) {
      console.error('Reset password error:', err);
      const errorMessage = err instanceof Error ? err.message : '发送重置邮件失败';
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-[320px] sm:max-w-[420px] overflow-hidden rounded-2xl sm:rounded-3xl">
          <div className="relative overflow-hidden">
            <div className={`absolute inset-0 ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#f3f4f6]'}`} />
            <img 
              src="/Login.png"
              alt="登录背景"
              className="w-full relative z-10"
              style={{ clipPath: 'inset(0 round 1rem sm:round 1.5rem)' }}
            />
            <div className="absolute inset-0 z-20">
              <div className="flex justify-between items-start px-4 sm:px-8 pt-4 sm:pt-6">
                <Dialog.Title className="text-2xl sm:text-3xl font-bold text-white">
                  {isLogin ? '登录' : '注册'}
                </Dialog.Title>
                <button 
                  onClick={onClose} 
                  className="absolute top-2 right-2 sm:right-4 text-white"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              
              <div className="px-4 sm:px-8 mt-8 sm:mt-[56px]">
                <form id="loginForm" onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  {!isLogin && (
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="用户名"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={`w-full px-3 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border border-white/30 outline-none
                          ${isDark 
                            ? 'bg-white/10 text-white placeholder-white/60 focus:border-white focus:ring-1 focus:ring-white' 
                            : 'bg-black/10 text-black placeholder-black/60 focus:border-black focus:ring-1 focus:ring-black'
                          }`}
                      />
                    </div>
                  )}

                  <div>
                    <input
                      type="email"
                      required
                      placeholder="邮箱"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full px-3 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border border-white/30 outline-none
                        ${isDark 
                          ? 'bg-white/10 text-white placeholder-white/60' 
                          : 'bg-black/10 text-black placeholder-black/60'
                        }`}
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      required
                      placeholder="密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full px-3 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border border-white/30 outline-none
                        ${isDark 
                          ? 'bg-white/10 text-white placeholder-white/60' 
                          : 'bg-black/10 text-black placeholder-black/60'
                        }`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className={`mr-2 rounded border-gray-300 
                          ${isDark 
                            ? 'bg-white/10 border-white/30' 
                            : 'bg-black/10 border-black/30'
                          }`}
                      />
                      <span className={`text-xs sm:text-sm ${isDark ? 'text-white/60' : 'text-black/60'}`}>
                        记住我
                      </span>
                    </label>
                    
                    {isLogin && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className={`text-xs sm:text-sm ${isDark ? 'text-white/60 hover:text-white' : 'text-black/60 hover:text-black'}`}
                      >
                        忘记密码？
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="text-red-500 text-sm">
                      {error}
                    </div>
                  )}
                </form>

                <div className="absolute bottom-1.5 left-4 right-4 sm:left-8 sm:right-8 flex justify-between items-center">
                  <div className={`text-xs sm:text-sm ${isDark ? 'text-white/60' : 'text-black/60'}`}>
                    {isLogin ? (
                      <p>
                        没有账号？{' '}
                        <button
                          type="button"
                          onClick={() => setIsLogin(false)}
                          className={`${isDark ? 'text-white' : 'text-black'} hover:underline`}
                        >
                          点击注册
                        </button>
                      </p>
                    ) : (
                      <p>
                        已有账号？{' '}
                        <button
                          type="button"
                          onClick={() => setIsLogin(true)}
                          className={`${isDark ? 'text-white' : 'text-black'} hover:underline`}
                        >
                          点击登录
                        </button>
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    form="loginForm"
                    disabled={isLoading}
                    className="px-4 sm:px-8 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg bg-white/20 text-white font-medium hover:bg-white/30 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? '处理中...' : (isLogin ? '登录' : '注册')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
