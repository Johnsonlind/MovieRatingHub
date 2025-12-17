import { useEffect, useRef } from 'react';

/**
 * 优化的图片预加载：确保滚动时无空白，同时避免手机端崩溃
 * - 使用 IntersectionObserver 监控所有图片
 * - 限制并发加载数量，避免内存压力
 * - 手机端降低预加载强度
 * - 清理机制防止内存泄漏
 */
export function useAggressiveImagePreload(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean = true
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const decodedSet = useRef<Set<string>>(new Set());
  const pendingDecode = useRef<Map<string, HTMLImageElement>>(new Map());
  const activeLoads = useRef<Set<string>>(new Set());
  const loadQueue = useRef<string[]>([]);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768;

    // 根据设备类型设置并发限制和预加载范围
    // 为了达到相册般的流畅体验，增加预加载范围
    const MAX_CONCURRENT_LOADS = isMobile ? 8 : 20; // 适度增加并发，确保流畅
    const PRELOAD_SCREENS = isMobile ? 4 : 6; // 大幅增加预加载范围，提前加载更多图片
    const ENABLE_FORCE_DECODE = !isMobile; // 手机端禁用强制解码，减少 CPU 压力

    // 处理加载队列
    const processQueue = () => {
      while (
        loadQueue.current.length > 0 &&
        activeLoads.current.size < MAX_CONCURRENT_LOADS
      ) {
        const url = loadQueue.current.shift();
        if (url && !activeLoads.current.has(url) && !decodedSet.current.has(url)) {
          // 从队列中取出，实际加载由 preloadAndDecode 处理
          // 这里只是标记，实际加载会在下面调用
          const imgElement = container.querySelector(`img[src="${url}"], img[data-src="${url}"]`) as HTMLImageElement;
          if (imgElement) {
            preloadAndDecode(imgElement, url);
          }
        }
      }
    };

    // 清理函数
    const cleanup = () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      // 清理所有创建的 Image 对象
      pendingDecode.current.forEach((img) => {
        img.onload = null;
        img.onerror = null;
        img.src = '';
      });
      pendingDecode.current.clear();
      activeLoads.current.clear();
      loadQueue.current = [];
      // 清理 canvas 引用
      canvasRefs.current.clear();
    };

    // 轻量级解码（仅标记，不强制 canvas 解码）
    const markDecoded = (url: string) => {
      decodedSet.current.add(url);
      activeLoads.current.delete(url);
      processQueue(); // 处理下一个队列项
    };

    // 预加载图片（不强制解码，减少 CPU 压力）
    const preloadAndDecode = (imgElement: HTMLImageElement, url: string) => {
      if (decodedSet.current.has(url) || activeLoads.current.has(url)) return;
      
      // 如果已经在队列中，跳过
      if (loadQueue.current.includes(url)) return;

      // 如果达到并发限制，加入队列
      if (activeLoads.current.size >= MAX_CONCURRENT_LOADS) {
        if (!loadQueue.current.includes(url)) {
          loadQueue.current.push(url);
        }
        return;
      }

      activeLoads.current.add(url);
      
      const img = new Image();
      img.decoding = 'async';
      // 使用 eager 确保图片尽快加载，配合 IntersectionObserver 控制
      img.loading = 'eager';
      img.crossOrigin = imgElement.crossOrigin || 'anonymous';
      
      img.onload = () => {
        // 只在非移动端且启用时才强制解码
        if (ENABLE_FORCE_DECODE) {
          const idleCallback = typeof (window as any).requestIdleCallback === 'function'
            ? (window as any).requestIdleCallback
            : (cb: () => void, opts?: { timeout?: number }) => setTimeout(cb, opts?.timeout || 0);
          
          idleCallback(() => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                canvasRefs.current.set(url, canvas);
              }
            } catch (e) {
              // 解码失败忽略
            }
            markDecoded(url);
          }, { timeout: 100 });
        } else {
          markDecoded(url);
        }
      };
      
      img.onerror = () => {
        markDecoded(url);
      };
      
      img.src = url;
      pendingDecode.current.set(url, img);
    };

    // IntersectionObserver 配置：根据设备类型调整预加载范围
    const viewportHeight = window.innerHeight;
    const rootMargin = `${viewportHeight * PRELOAD_SCREENS}px`;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const img = entry.target as HTMLImageElement;
          if (!img || img.tagName !== 'IMG') return;
          
          const url = img.src || img.getAttribute('data-src') || '';
          if (!url || url.startsWith('data:') || decodedSet.current.has(url)) return;

          // 如果图片即将进入视口（或已在视口内），预加载
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            // 如果图片元素已存在且已加载，直接标记
            if (img.complete && img.naturalWidth > 0) {
              markDecoded(url);
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

    // 只观察现有图片，不立即预加载所有图片（避免内存压力）
    const images = container.querySelectorAll('img');
    images.forEach((img) => {
      const url = img.src || img.getAttribute('data-src') || '';
      if (url && !url.startsWith('data:')) {
        observerRef.current?.observe(img);
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
              const url = img.src || img.getAttribute('data-src') || '';
              if (url && !url.startsWith('data:')) {
                observerRef.current?.observe(img);
              }
            });
            // 如果节点本身就是 img
            if (element.tagName === 'IMG') {
              const url = element.getAttribute('src') || element.getAttribute('data-src') || '';
              if (url && !url.startsWith('data:')) {
                observerRef.current?.observe(element);
              }
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
