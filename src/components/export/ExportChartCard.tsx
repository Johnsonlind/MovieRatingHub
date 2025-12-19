// ==========================================
// 榜单导出卡片组件 - 用于生成PNG图片的榜单卡片
// ==========================================
// 榜单导出卡片不需要Link，因为导出时不需要交互

interface ChartEntry {
  tmdb_id: number;
  rank: number;
  title: string;
  poster: string;
  media_type?: 'movie' | 'tv';
}

interface ExportChartCardProps {
  platform: string;
  chartName: string;
  entries: ChartEntry[];
  platformLogo?: string;
}

export function ExportChartCard({ 
  platform, 
  chartName, 
  entries,
  platformLogo 
}: ExportChartCardProps) {
  // 确保所有海报URL都通过代理 - 避免CORS问题
  const processedEntries = entries.map(entry => {
    let posterUrl = entry.poster || '';
    // 如果poster为空或者是空字符串，保持为空
    if (!posterUrl || posterUrl.trim() === '') {
      return { ...entry, poster: '' };
    }
    // 如果已经是base64，直接使用
    if (posterUrl.startsWith('data:image/')) {
      return { ...entry, poster: posterUrl };
    }
    // 如果是http/https开头的完整URL，使用image-proxy代理
    if (posterUrl.startsWith('http')) {
      return { ...entry, poster: `/api/image-proxy?url=${encodeURIComponent(posterUrl)}` };
    }
    // 如果已经是/api/image-proxy，直接使用
    if (posterUrl.startsWith('/api/image-proxy')) {
      return { ...entry, poster: posterUrl };
    }
    // 如果是/tmdb-images开头的相对路径，转换为完整URL后使用代理
    if (posterUrl.startsWith('/tmdb-images/')) {
      const fullUrl = `https://image.tmdb.org/t/p${posterUrl.substring(12)}`;
      return { ...entry, poster: `/api/image-proxy?url=${encodeURIComponent(fullUrl)}` };
    }
    // 如果以/开头但不是/tmdb-images，添加/tmdb-images前缀后使用代理
    if (posterUrl.startsWith('/')) {
      const fullUrl = `https://image.tmdb.org/t/p/w500${posterUrl}`;
      return { ...entry, poster: `/api/image-proxy?url=${encodeURIComponent(fullUrl)}` };
    }
    // 其他情况，直接使用image-proxy
    return { ...entry, poster: `/api/image-proxy?url=${encodeURIComponent(posterUrl)}` };
  });

  // 计算网格布局：每行5个
  const rows = [];
  for (let i = 0; i < processedEntries.length; i += 5) {
    rows.push(processedEntries.slice(i, i + 5));
  }

  // 检测主题
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  
  // 卡片样式 - 包含原containerStyle的尺寸和padding
  const cardStyle = {
    width: '1200px',
    minHeight: '902px',
    backgroundColor: isDark ? '#0a0e1a' : '#e0f2fe',
    background: isDark 
      ? `linear-gradient(135deg, #0a0e1a 0%, #0f172a 50%, #1e293b 100%)`
      : `linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)`,
    backdropFilter: 'blur(50px) saturate(200%)',
    WebkitBackdropFilter: 'blur(50px) saturate(200%)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.6)',
    borderRadius: '20px',
    padding: '50px',
    boxShadow: isDark
      ? `0 16px 48px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3),
         inset 0 1px 0 rgba(255, 255, 255, 0.1),
         inset 0 -1px 0 rgba(255, 255, 255, 0.05)`
      : `0 16px 48px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1),
         inset 0 1px 0 rgba(255, 255, 255, 0.6),
         inset 0 -1px 0 rgba(255, 255, 255, 0.15)`,
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
    fontFamily: "'ShangGuDengKuan', 'Onest', system-ui, -apple-system, sans-serif" as const
  };

  // 榜单内容容器样式 - 参考posterGlassStyle
  const chartContentContainerStyle = {
    width: '100%',
    backgroundColor: isDark ? '#0a0e1a' : '#f0f9ff',
    background: isDark 
      ? `linear-gradient(135deg, #0a0e1a 0%, #0f172a 50%, #1e293b 100%)`
      : `linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)`,
    backdropFilter: 'blur(50px) saturate(200%)',
    WebkitBackdropFilter: 'blur(50px) saturate(200%)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.6)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: isDark
      ? `0 12px 40px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)`
      : `0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)`,
    position: 'relative' as const,
    zIndex: 1
  };

  return (
    <div style={cardStyle}>
      {/* 毛玻璃磨砂纹理效果 - 根据主题调整 */}
      <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: isDark
            ? `
              radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.1) 0%, transparent 45%),
              radial-gradient(circle at 80% 70%, rgba(30, 58, 138, 0.08) 0%, transparent 45%),
              radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.05) 0%, transparent 50%),
              linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, transparent 50%)
            `
            : `
              radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.2) 0%, transparent 45%),
              radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.15) 0%, transparent 45%),
              radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
              linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 50%),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(255, 255, 255, 0.02) 2px,
                rgba(255, 255, 255, 0.02) 4px
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                rgba(255, 255, 255, 0.02) 2px,
                rgba(255, 255, 255, 0.02) 4px
              )
            `,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: isDark ? 0.6 : 0.9
        }} />
      {/* 标题区域 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '40px', position: 'relative', zIndex: 1 }}>
          {platformLogo && (
            <img 
              src={platformLogo} 
              alt={platform}
              style={{ 
                width: '40px', 
                height: '40px', 
                objectFit: 'contain', 
                display: 'block',
                imageRendering: 'auto'
              }}
              crossOrigin="anonymous"
            />
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: isDark ? '#e5e7eb' : '#111827', margin: 0, lineHeight: '1.3', marginBottom: '4px' }}>
              {platform}
            </h1>
            <h2 style={{ fontSize: '18px', fontWeight: '500', color: isDark ? '#9ca3af' : '#374151', margin: 0, lineHeight: '1.4' }}>
              {chartName}
            </h2>
          </div>
      </div>

      {/* 榜单内容 - 网格布局 */}
      <div style={chartContentContainerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', zIndex: 1 }}>
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {row.map(entry => {
                return (
                  <div key={`${entry.tmdb_id}-${entry.rank}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <div style={{ width: '100%', position: 'relative' }}>
                      <div 
                        style={{ 
                          aspectRatio: '2/3',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          position: 'relative',
                          width: '100%',
                          boxShadow: 'none',
                          background: 'transparent'
                        }}
                      >
                        {entry.poster && entry.poster.trim() !== '' ? (
                          <img
                            src={entry.poster}
                            alt={entry.title}
                            crossOrigin="anonymous"
                            loading="eager"
                            style={{ 
                              display: 'block',
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: '10px',
                              boxShadow: 'none',
                              filter: 'none'
                            }}
                            onError={(e) => {
                              // 如果图片加载失败，显示占位符
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent && !parent.querySelector('.placeholder')) {
                                const placeholder = document.createElement('div');
                                placeholder.className = 'placeholder w-full h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-xl';
                                placeholder.textContent = '无海报';
                                parent.appendChild(placeholder);
                              }
                            }}
                          />
                        ) : (
                          <div style={{ 
                            width: '100%', 
                            height: '100%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '12px', 
                            color: '#6b7280', 
                            backgroundColor: '#e5e7eb',
                            borderRadius: '10px'
                          }}>
                            无海报
                          </div>
                        )}
                        {/* 排名标签 - 红色丝带样式 */}
                        <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10, pointerEvents: 'none' }}>
                          <svg width="36" height="28" viewBox="0 0 36 28" className="drop-shadow-md" style={{ display: 'block' }}>
                            {/* 红色丝带形状 */}
                            <path
                              d="M 0 7 Q 0 0 7 0 L 29 0 Q 36 0 36 7 L 36 28 L 18 22 L 0 28 Z"
                              fill="#DC2626"
                              stroke="none"
                            />
                            {/* 排名数字 - 白色 */}
                            <text
                              x="18"
                              y="13"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="text-[15px] font-bold fill-white"
                              style={{ fontSize: '15px', fontWeight: 'bold' }}
                            >
                              {entry.rank}
                            </text>
                          </svg>
                        </div>
                      </div>
                      <div style={{ 
                        marginTop: '8px', 
                        fontSize: '16px', 
                        textAlign: 'center', 
                        color: isDark ? '#e5e7eb' : '#111827', 
                        fontWeight: '500',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4',
                        minHeight: '36px',
                        maxHeight: '36px'
                      }}>
                        {entry.title}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* 填充空位 */}
              {Array.from({ length: 5 - row.length }).map((_, idx) => (
                <div key={`empty-${idx}`} style={{ aspectRatio: '2/3' }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 首页Logo - 右下角 */}
      <div style={{ 
          position: 'absolute', 
          bottom: '24px', 
          right: '10px', 
          zIndex: 100
        }}>
          <img
            src="/logos/home.png"
            alt="Home"
            crossOrigin="anonymous"
            style={{ 
              display: 'block', 
              width: '32px', 
              height: '32px', 
              objectFit: 'contain',
              imageRendering: 'auto'
            }}
          />
        </div>
      </div>
  );
}

