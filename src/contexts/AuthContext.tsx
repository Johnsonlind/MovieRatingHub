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

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api.ratefuse.cn'
  : '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 检查本地存储的 token
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/user/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      localStorage.removeItem('token');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    console.log('开始登录请求:', { email, rememberMe });
    
    try {
      const requestUrl = `${API_BASE_URL}/auth/login`;
      console.log('请求URL:', requestUrl);
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // 添加额外的请求头以便追踪
          'X-Request-ID': Date.now().toString()
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, remember_me: rememberMe })
      });
    
      console.log('登录响应状态:', response.status);
      console.log('登录响应头:', Object.fromEntries(response.headers.entries()));
      
      let errorData;
      const responseText = await response.text();
      console.log('原始响应文本:', responseText);
      
      try {
        errorData = JSON.parse(responseText);
        console.log('解析后的响应数据:', errorData);
      } catch (e) {
        console.error('响应数据解析失败:', e);
        throw new Error('服务器响应格式错误');
      }
      
      if (!response.ok) {
        console.log('错误响应类型:', errorData.error_type);
        if (errorData.error_type === 'email_not_found') {
          throw new Error('此邮箱未注册');
        } else if (errorData.error_type === 'invalid_password') {
          throw new Error('邮箱或密码错误');
        } else {
          throw new Error(errorData.detail || '登录失败');
        }
      }
      
      // 登录成功的处理
      localStorage.setItem('token', errorData.access_token);
      
      // 获取用户信息
      const userResponse = await fetch('/api/user/me', {
        headers: {
          'Authorization': `Bearer ${errorData.access_token}`
        }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('登录过程出错:', error);
      throw error;
    }
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

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    // 可选：重定向到首页
    window.location.href = '/';
  };

  const updateUserInfo = (updatedUser: User) => {
    setUser(updatedUser);
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
