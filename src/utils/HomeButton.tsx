// ==========================================
// 主页按钮组件 - 返回首页按钮
// ==========================================
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export const HomeButton = () => {
  return (
    <Link 
      to="/" 
      className="w-7 h-7 flex items-center justify-center rounded-full overflow-hidden bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 hover:scale-110"
      aria-label="主页"
    >
      <Home className="w-5 h-5 text-gray-700 dark:text-white" />
    </Link>
  );
};