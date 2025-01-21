import { toPng } from 'html-to-image';

interface ExportError extends Error {
  name: string;
  message: string;
  stack?: string;
}

// 预加载图片函数
export const preloadImages = async (imageUrls: string[]) => {
  const promises = imageUrls.map(url => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
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
    
    // 确保所有图片都有 crossOrigin 属性
    Array.from(images).forEach(img => {
      if (!img.crossOrigin) {
        img.crossOrigin = 'anonymous';
      }
    });

    // 等待所有图片加载
    console.time('images-loading');
    await Promise.all(
      Array.from(images).map(
        img => img.complete || new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        })
      )
    );
    console.timeEnd('images-loading');
    console.log('所有图片加载完成,开始导出...');

    // 使用 html-to-image 导出
    console.time('html-to-image');
    console.time('html-to-image-clone');
    console.log('开始 DOM 克隆...');
    
    // 记录原始信息
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
      pixelRatio: 1, // 降低像素比
      skipAutoScale: true,
      cacheBust: true,
      onclone: (clonedNode) => {
        console.timeEnd('html-to-image-clone');
        
        // 确保克隆节点中的图片也有 crossOrigin 属性
        const clonedImages = clonedNode.getElementsByTagName('img');
        Array.from(clonedImages).forEach(img => {
          img.crossOrigin = 'anonymous';
        });

        console.log('DOM 克隆完成，开始处理图片...');
        console.time('html-to-image-process');
      },
      filter: (node) => {
        try {
          // 首先检查节点是否是 Element
          if (!(node instanceof Element)) {
            return false;
          }

          const element = node as HTMLElement;
          
          // 检查样式属性是否存在
          const computedStyle = window.getComputedStyle(element);
          const isVisible = computedStyle.display !== 'none' && 
                           computedStyle.visibility !== 'hidden' &&
                           computedStyle.opacity !== '0';
          
          // 检查是否是空的装饰性元素
          const hasChildren = element.children.length > 0;
          const hasText = element.textContent ? element.textContent.trim().length > 0 : false;
          const isDecorative = element.tagName === 'DIV' && !hasChildren && !hasText;
          
          return isVisible && !isDecorative;
        } catch (err) {
          console.warn('节点过滤出错:', err);
          return true; // 如果出错就保留该节点
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
    const exportError = error as ExportError;
    console.error('导出过程中出错:', exportError);
    console.error('错误详情:', {
      name: exportError.name,
      message: exportError.message,
      stack: exportError.stack
    });
    throw exportError;
  }
}
