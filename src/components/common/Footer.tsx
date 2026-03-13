// ==========================================
// 页脚组件
// ==========================================
export function Footer() {
  return (
    <div className="w-full py-6 mt-8 flex justify-center items-center gap-2">
      <a 
        href="https://weibo.com/u/2238200645" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
      >
        <img src="/logos/weibo.png" alt="微博" className="w-5 h-5" />
        <span>守望电影</span>
      </a>
    </div>
  );
}
