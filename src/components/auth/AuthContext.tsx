// ==========================================
// 认证上下文
// ==========================================
import { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  username: string;
  avatar: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUserInfo: (user: User) => void;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // 添加缓存用户信息
  const [, setCachedUserInfo] = useState<{
    data: User | null;
    timestamp: number;
  } | null>(null);

  // 检查缓存是否有效的函数
  const isCacheValid = (timestamp: number) => {
    const now = Date.now();
    return (now - timestamp) < 5 * 60 * 1000; // 5分钟有效期
  };

  useEffect(() => {
    // 尝试从本地存储获取缓存的用户信息
    const cachedUser = localStorage.getItem('cachedUserInfo');
    const token = localStorage.getItem('token');
    
    if (cachedUser && token) {
      try {
        const parsedCache = JSON.parse(cachedUser);
        
        // 使用 isCacheValid 函数检查缓存是否有效
        if (parsedCache.timestamp && isCacheValid(parsedCache.timestamp)) {
          setUser(parsedCache.data);
          setCachedUserInfo(parsedCache);
          setIsLoading(false);
          
          // 在后台刷新用户数据
          fetchUser(true);
          return;
        }
      } catch (e) {
        console.error('解析缓存用户信息失败:', e);
        localStorage.removeItem('cachedUserInfo');
      }
    }
    
    if (token) {
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUser = async (background = false) => {
    if (!background) setIsLoading(true);
    
    try {
      const response = await fetch('/api/user/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        // 添加缓存控制
        cache: 'no-store'
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // 更新状态
        setUser(userData);
        
        // 缓存用户信息
        const cacheData = {
          data: userData,
          timestamp: Date.now()
        };
        setCachedUserInfo(cacheData);
        localStorage.setItem('cachedUserInfo', JSON.stringify(cacheData));
      } else {
        // 清除无效的令牌和缓存
        localStorage.removeItem('token');
        localStorage.removeItem('cachedUserInfo');
        setUser(null);
        setCachedUserInfo(null);
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('cachedUserInfo');
      setUser(null);
      setCachedUserInfo(null);
    } finally {
      if (!background) setIsLoading(false);
    }
  };

  // 优化登录函数 - 使用并行请求
  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember_me: rememberMe })
      });
    
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail);
      }
    
      const data = await response.json();
      localStorage.setItem('token', data.access_token);
      
      // 立即使用令牌获取用户信息
      const userResponse = await fetch('/api/user/me', {
        headers: {
          'Authorization': `Bearer ${data.access_token}`
        }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        
        // 更新状态
        setUser(userData);
        
        // 缓存用户信息
        const cacheData = {
          data: userData,
          timestamp: Date.now()
        };
        setCachedUserInfo(cacheData);
        localStorage.setItem('cachedUserInfo', JSON.stringify(cacheData));
      }
    } catch (error) {
      console.error('登录失败:', error);
      throw error;
    }
  };

  // 优化更新用户信息函数
  const updateUserInfo = (updatedUser: User) => {
    setUser(updatedUser);
    
    // 更新缓存
    const cacheData = {
      data: updatedUser,
      timestamp: Date.now()
    };
    setCachedUserInfo(cacheData);
    localStorage.setItem('cachedUserInfo', JSON.stringify(cacheData));
  };

  // 优化登出函数
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('cachedUserInfo');
    setUser(null);
    setCachedUserInfo(null);
    
    // 使用 setTimeout 避免阻塞UI
    setTimeout(() => {
      window.location.href = '/';
    }, 0);
  };

  const register = async (email: string, username: string, password: string) => {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    const data = await response.json();
    localStorage.setItem('token', data.access_token);
    setUser(data.user);
  };

  const sendPasswordResetEmail = async (email: string): Promise<void> => {
    const response = await fetch('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }
  };

  const resetPassword = async (token: string, password: string): Promise<void> => {
    const response = await fetch('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      register, 
      logout,
      updateUserInfo,
      sendPasswordResetEmail,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};