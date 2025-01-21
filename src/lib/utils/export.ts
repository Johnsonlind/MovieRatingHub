import { toPng } from 'html-to-image';

// 预加载图片函数
export const preloadImages = async (imageUrls: string[]) => {
  const promises = imageUrls.map(url => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';  // 添加跨域支持
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
  });
  
  await Promise.all(promises);
};

// 添加新的工具函数
async function convertImageToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const base64 = canvas.toDataURL('image/png', 1.0);
        resolve(base64);
      } catch (error) {
        console.error('转换图片失败:', error);
        reject(error);
      }
    };
    
    img.onerror = () => {
      console.error('加载图片失败:', url);
      reject(new Error(`Failed to load image: ${url}`));
    };

    // 如果不是完整URL，添加当前域名
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    img.src = fullUrl;
  });
}

// 修改导出函数
export async function exportToPng(element: HTMLElement, filename: string) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    console.log('开始处理图片...');
    // 预处理所有图片
    const images = element.getElementsByTagName('img');
    const imageLoadPromises = Array.from(images).map(async (img) => {
      try {
        // 保存原始src
        const originalSrc = img.src;
        // 设置跨域属性
        img.crossOrigin = 'anonymous';
        // 转换图片为base64
        const base64 = await convertImageToBase64(originalSrc);
        img.src = base64;
        
        return new Promise<void>((resolve) => {
          const newImg = new Image();
          newImg.onload = () => {
            console.log('图片加载成功:', originalSrc);
            resolve();
          };
          newImg.onerror = () => {
            console.warn('图片加载失败:', originalSrc);
            img.src = originalSrc; // 失败时恢复原始src
            resolve();
          };
          newImg.src = base64;
        });
      } catch (error) {
        console.warn(`图片处理失败: ${img.src}`, error);
        return Promise.resolve(); // 继续处理其他图片
      }
    });

    // 等待所有图片加载完成
    await Promise.all(imageLoadPromises);
    console.log('所有图片加载完成,开始导出...');

    // 使用 html-to-image 导出
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true,
      filter: (node) => {
        // 保留所有图片节点
        if (node.tagName === 'IMG') {
          return true;
        }
        // 其他节点的默认过滤逻辑
        const element = node as HTMLElement;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
      }
    });

    // 下载图片
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('导出成功完成');
  } catch (error) {
    console.error('导出失败:', error);
    throw new Error('导出图片失败');
  }
}
