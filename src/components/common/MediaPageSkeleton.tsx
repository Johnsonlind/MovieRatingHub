// ==========================================
// 媒体页面骨架屏组件
// ==========================================
export function MediaPageSkeleton() {
  return (
    <>
      {/* Hero 骨架屏 */}
      <div className="relative min-h-[45vh] sm:min-h-[60vh] bg-gray-200 dark:bg-gray-800 animate-pulse">
        <div className="container mx-auto px-4 py-4 sm:py-8 relative">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 items-start">
            <div className="w-32 sm:w-48 lg:w-64 mx-auto sm:mx-0 flex-shrink-0">
              <div className="w-full aspect-[2/3] bg-gray-300 dark:bg-gray-700 rounded-lg"></div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 元数据骨架屏 */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex gap-4 animate-pulse">
          <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-24"></div>
          <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-24"></div>
          <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-32"></div>
        </div>
      </div>
      
      {/* 评分区域骨架屏 */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-4 h-32"></div>
          ))}
        </div>
      </div>
    </>
  );
}
