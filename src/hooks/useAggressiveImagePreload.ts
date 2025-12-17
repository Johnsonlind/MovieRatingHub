import { useEffect, useRef } from 'react';

/**
 * 激进图片预加载：确保滚动时无空白
 * - 使用 IntersectionObserver 监控所有图片
 * - 提前 2-3 屏预加载和解码
 * - 强制解码即将进入视口的图片
 */
export function useAggressiveImagePreload(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean = true
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const decodedSet = useRef<Set<string>>(new Set());
  const pendingDecode = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    // 清理函数
    const cleanup = () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      pendingDecode.current.clear();
    };

    // 强制解码图片
    const forceDecode = (img: HTMLImageElement, url: string) => {
      if (decodedSet.current.has(url)) return;
      
      // 如果图片已加载但未解码，强制解码
      if (img.complete && img.naturalWidth > 0) {
        decodedSet.current.add(url);
        return;
      }

      // 创建临时 canvas 强制解码
      if (img.complete) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 1;
          canvas.height = img.naturalHeight || 1;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            decodedSet.current.add(url);
          }
        } catch (e) {
          // 解码失败，标记为已处理避免重复
          decodedSet.current.add(url);
        }
      }
    };

    // 预加载和解码图片
    const preloadAndDecode = (imgElement: HTMLImageElement, url: string) => {
      if (decodedSet.current.has(url)) return;
      
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.crossOrigin = imgElement.crossOrigin || 'anonymous';
      
      img.onload = () => {
        // 图片加载完成后强制解码
        requestAnimationFrame(() => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              decodedSet.current.add(url);
            }
          } catch (e) {
            decodedSet.current.add(url);
          }
        });
      };
      
      img.onerror = () => {
        decodedSet.current.add(url);
      };
      
      img.src = url;
      pendingDecode.current.set(url, img);
    };

    // IntersectionObserver 配置：提前 8 屏预加载（超快速滚动优化）
    const viewportHeight = window.innerHeight;
    // 使用更大的预加载范围，确保超快速滚动时也有足够缓冲
    const rootMargin = `${viewportHeight * 8}px`;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const img = entry.target as HTMLImageElement;
          if (!img || img.tagName !== 'IMG') return;
          
          const url = img.src || img.getAttribute('data-src') || '';
          if (!url || decodedSet.current.has(url)) return;

          // 如果图片即将进入视口（或已在视口内），立即预加载
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            // 如果图片元素已存在但未加载，直接使用
            if (img.complete && img.naturalWidth > 0) {
              forceDecode(img, url);
            } else {
              preloadAndDecode(img, url);
            }
          }
        });
      },
      {
        root: null,
        rootMargin,
        threshold: [0, 0.1, 0.5, 1],
      }
    );

    // 立即预加载所有图片（不等待 IntersectionObserver）
    const images = container.querySelectorAll('img');
    const allUrls = new Set<string>();
    
    images.forEach((img) => {
      const url = img.src || img.getAttribute('data-src') || '';
      if (url && !url.startsWith('data:') && !decodedSet.current.has(url)) {
        allUrls.add(url);
        observerRef.current?.observe(img);
        
        // 立即开始预加载
        const preloadImg = new Image();
        preloadImg.decoding = 'async';
        preloadImg.loading = 'eager';
        preloadImg.crossOrigin = img.crossOrigin || 'anonymous';
        
        preloadImg.onload = () => {
          // 立即强制解码
          requestAnimationFrame(() => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = preloadImg.width;
              canvas.height = preloadImg.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(preloadImg, 0, 0);
                decodedSet.current.add(url);
              }
            } catch (e) {
              decodedSet.current.add(url);
            }
          });
        };
        
        preloadImg.onerror = () => {
          decodedSet.current.add(url);
        };
        
        preloadImg.src = url;
      }
    });

    // 监听新添加的图片
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const images = element.querySelectorAll('img');
            images.forEach((img) => {
              if (img.src && !img.src.startsWith('data:')) {
                observerRef.current?.observe(img);
              }
            });
            // 如果节点本身就是 img
            if (element.tagName === 'IMG' && element.getAttribute('src') && !element.getAttribute('src')?.startsWith('data:')) {
              observerRef.current?.observe(element);
            }
          }
        });
      });
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      cleanup();
      mutationObserver.disconnect();
    };
  }, [enabled, containerRef]);
}
