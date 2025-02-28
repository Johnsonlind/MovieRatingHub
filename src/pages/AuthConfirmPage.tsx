import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useAuth();

  useEffect(() => {
    const handleConfirm = async () => {
      try {
        console.log('开始处理确认页面');
        
        const token = searchParams.get('token');

        if (!token) {
          console.error('缺少必要的参数');
          navigate('/auth/auth-code-error');
          return;
        }

        // 直接跳转到重置密码页面，让用户输入新密码
        navigate(`/reset-password?token=${token}`);
      } catch (err) {
        console.error('确认过程出错:', err);
        navigate('/auth/auth-code-error');
      }
    };

    handleConfirm();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
    </div>
  );
} 