// ==========================================
// 页面页脚组件
// ==========================================
export function Footer() {
  return (
    <div className="w-full py-6 mt-8 flex justify-center items-center gap-2">
      <a 
        href="https://weibo.com/u/2238200645" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-white/40 dark:hover:bg-black-800/40 hover:shadow-lg transition-all duration-200"
      >
        <img src="/logos/weibo.png" alt="微博" className="w-5 h-5" />
        <span>守望电影</span>
      </a>
    </div>
  );
}
