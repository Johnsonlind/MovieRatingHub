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
    
    // 预加载所有图片
    const images = element.getElementsByTagName('img');
    const imageLoadPromises = Array.from(images).map(img => 
      new Promise<void>((resolve, reject) => {
        if (img.complete) {
          resolve();
          return;
        }

        const originalSrc = img.src;
        img.crossOrigin = 'anonymous';
        
        const newImg = new Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = () => {
          img.src = newImg.src;
          resolve();
        };
        newImg.onerror = () => {
          console.warn(`图片加载失败: ${originalSrc}`);
          reject(new Error(`Failed to load image: ${originalSrc}`));
        };
        newImg.src = originalSrc;
      })
    );

    console.time('images-loading');
    await Promise.all(imageLoadPromises);
    console.timeEnd('images-loading');
    
    // 使用 html-to-image 导出
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 1.5,
      backgroundColor: '#ffffff',
      skipAutoScale: true,
      cacheBust: true,
      onclone: async (clonedNode) => {
        // 处理克隆节点中的文本元素
        const elements = clonedNode.getElementsByTagName('*');
        Array.from(elements).forEach(el => {
          if (el instanceof HTMLElement && el.textContent?.trim()) {
            // 直接设置内联样式
            el.style.cssText = `
              font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              color: ${window.getComputedStyle(el).color} !important;
              font-size: ${window.getComputedStyle(el).fontSize} !important;
              font-weight: ${window.getComputedStyle(el).fontWeight} !important;
              line-height: ${window.getComputedStyle(el).lineHeight} !important;
              text-align: ${window.getComputedStyle(el).textAlign} !important;
              background-color: ${window.getComputedStyle(el).backgroundColor} !important;
            `;
          }
        });

        // 确保所有图片都设置了 crossOrigin
        const clonedImages = clonedNode.getElementsByTagName('img');
        Array.from(clonedImages).forEach(img => {
          img.crossOrigin = 'anonymous';
          img.style.cssText = 'object-fit: contain !important;';
        });
      },
      filter: (node) => {
        if (!(node instanceof Element)) return false;
        const style = window.getComputedStyle(node as HTMLElement);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
      }
    });

    // 创建下载链接
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();

    console.timeEnd('total-export');
    return dataUrl;
  } catch (error) {
    console.error('导出过程中出错:', error);
    throw error;
  }
}
