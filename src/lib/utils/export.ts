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
    
    // 等待所有图片加载完成
    console.time('images-loading');
    const images = element.getElementsByTagName('img');
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
    
    // 先记录原始节点数量
    console.log('原始 DOM 节点数量:', element.getElementsByTagName('*').length);
    
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true,
      onclone: (clonedNode) => {
        console.timeEnd('html-to-image-clone');
        const nodeCount = clonedNode.getElementsByTagName('*').length;
        console.log('DOM 克隆完成，节点数量:', nodeCount);
        
        // 输出一些关键节点的信息
        const images = clonedNode.getElementsByTagName('img');
        console.log('图片元素数量:', images.length);
        
        const canvases = clonedNode.getElementsByTagName('canvas');
        console.log('Canvas元素数量:', canvases.length);
        
        console.time('html-to-image-process');
        console.log('开始图片处理...');
      },
      filter: (node) => {
        const element = node as HTMLElement;
        const display = element.style?.display;
        const result = display !== 'none';
        if (!result) {
          console.log('过滤掉隐藏节点:', element.tagName);
        }
        return result;
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
