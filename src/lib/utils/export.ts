import { toPng } from 'html-to-image';

// 预加载图片函数
export const preloadImages = async (imageUrls: string[]) => {
  const promises = imageUrls.map(url => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  });
  
  await Promise.all(promises);
};

// 导出为PNG图片
export async function exportToPng(element: HTMLElement, filename: string) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    console.time('total-export');
    console.log('开始导出过程...');
    
    // 预处理图片
    const images = element.getElementsByTagName('img');
    console.log('需要处理的图片数量:', images.length);
    
    // 并行预加载所有图片
    console.time('images-loading');
    const imageLoadPromises = Array.from(images).map(img => {
      // 如果图片已经加载完成，直接返回
      if (img.complete && img.naturalHeight !== 0) {
        return Promise.resolve();
      }

      // 否则创建加载Promise
      return new Promise<void>((resolve) => {
        img.crossOrigin = 'anonymous';
        
        const originalSrc = img.src;
        // 添加时间戳避免缓存
        img.src = `${originalSrc}${originalSrc.includes('?') ? '&' : '?'}_t=${Date.now()}`;
        
        img.onload = () => {
          console.log(`图片加载成功: ${img.src}`);
          resolve();
        };
        img.onerror = () => {
          console.warn(`图片加载失败: ${img.src}, 尝试不带时间戳重新加载`);
          // 如果带时间戳加载失败，尝试使用原始URL
          img.src = originalSrc;
          img.onload = () => resolve();
          img.onerror = () => {
            console.error(`图片加载失败: ${originalSrc}`);
            resolve(); // 即使失败也resolve，避免整个过程卡住
          };
        };
      });
    });

    // 等待所有图片加载完成
    await Promise.all(imageLoadPromises);
    console.timeEnd('images-loading');
    console.log('所有图片加载完成,开始导出...');

    // 使用 html-to-image 导出
    console.time('html-to-image');
    console.time('html-to-image-clone');
    console.log('开始 DOM 克隆...');
    
    // 先记录原始节点数量和元素信息
    const originalNodes = element.getElementsByTagName('*');
    console.log('原始 DOM 节点数量:', originalNodes.length);
    console.log('原始元素信息:', {
      width: element.offsetWidth,
      height: element.offsetHeight,
      images: element.getElementsByTagName('img').length,
      svgs: element.getElementsByTagName('svg').length,
      canvases: element.getElementsByTagName('canvas').length
    });
    
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 1.5,
      skipAutoScale: true,
      cacheBust: true,
      fetchRequestInit: {
        // 添加跨域请求配置
        mode: 'cors',
        credentials: 'same-origin'
      },
      onclone: async (clonedNode) => {
        console.timeEnd('html-to-image-clone');
        
        try {
          // 预加载所有图片
          const images = clonedNode.getElementsByTagName('img');
          const imageLoadPromises = Array.from(images).map(img => 
            new Promise<void>((resolve) => {
              const originalSrc = img.src;
              img.crossOrigin = 'anonymous';
              
              // 为图片URL添加时间戳，避免缓存
              const timestamp = Date.now();
              img.src = originalSrc.includes('?') 
                ? `${originalSrc}&_t=${timestamp}` 
                : `${originalSrc}?_t=${timestamp}`;
              
              img.onload = () => resolve();
              img.onerror = () => {
                console.warn(`图片加载失败: ${originalSrc}`);
                img.src = originalSrc; // 失败时尝试原始URL
                resolve();
              };
            })
          );
          
          await Promise.all(imageLoadPromises);
          
          // 处理文本元素
          const elements = clonedNode.getElementsByTagName('*');
          Array.from(elements).forEach(el => {
            if (el instanceof HTMLElement && el.textContent?.trim()) {
              const style = window.getComputedStyle(el);
              // 使用内联样式确保文本渲染
              el.style.cssText = `
                ${el.style.cssText};
                font-family: -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
                font-size: ${style.fontSize} !important;
                font-weight: ${style.fontWeight} !important;
                line-height: ${style.lineHeight} !important;
                color: ${style.color} !important;
                text-align: ${style.textAlign} !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
                letter-spacing: ${style.letterSpacing} !important;
              `;
              
              // 确保背景色和边框也被保留
              if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                el.style.backgroundColor = style.backgroundColor;
              }
              if (style.border !== 'none') {
                el.style.border = style.border;
              }
            }
          });

          console.log('DOM 克隆和样式处理完成');
          console.time('html-to-image-process');
        } catch (error) {
          console.error('克隆处理过程出错:', error);
        }
      },
      filter: (node) => {
        try {
          if (!(node instanceof Element)) {
            return false;
          }

          const element = node as HTMLElement;
          const computedStyle = window.getComputedStyle(element);
          const isVisible = computedStyle.display !== 'none' && 
                           computedStyle.visibility !== 'hidden' &&
                           computedStyle.opacity !== '0' &&
                           element.offsetWidth > 0 &&
                           element.offsetHeight > 0;
          
          return isVisible;
        } catch (err) {
          console.warn('节点过滤出错:', err);
          return true;
        }
      }
    });
    
    console.timeEnd('html-to-image-process');
    console.log('图片处理完成');
    console.timeEnd('html-to-image');

    // 下载图片
    console.time('download');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.timeEnd('download');

    console.timeEnd('total-export');
    console.log('导出成功完成');
  } catch (error) {
    const exportError = error as Error;
    console.error('导出过程中出错:', {
      name: exportError.name,
      message: exportError.message,
      stack: exportError.stack
    });
    throw exportError;
  }
}
