// ==========================================
// 返回顶部按钮
// ==========================================
import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);

  // 监听滚动事件，决定按钮是否可见
  useEffect(() => {
    const toggleVisibility = () => {
      // 当页面滚动超过300px时显示按钮
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    // 清理事件监听器
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  // 滚动到顶部的函数
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth' // 平滑滚动
    });
  };

  // 如果按钮不可见，则不渲染
  if (!isVisible) {
    return null;
  }

  return (
    <button 
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 w-10 h-10 flex items-center justify-center rounded-full overflow-hidden bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 hover:scale-110 shadow-lg z-50"
      aria-label="返回顶部"
    >
      <ArrowUp className="w-5 h-5 text-gray-700 dark:text-white" />
    </button>
  );
}; 