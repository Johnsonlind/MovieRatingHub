// ==========================================
// 返回顶部按钮组件 - 平滑滚动到页面顶部
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
      className="fixed bottom-2 right-2 z-30 p-2 rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-sm transition-colors"
      aria-label="返回顶部"
    >
      <ArrowUp className="w-4 h-4" />
    </button>
  );
}; 