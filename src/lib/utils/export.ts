import { toPng } from 'html-to-image';

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

// 添加新的工具函数来获取完整的资源URL
function getFullResourceUrl(url: string): string {
  // 如果已经是完整URL，直接返回
  if (url.startsWith('http')) {
    return url;
  }
  // 获取当前网站的基础URL
  const baseUrl = window.location.origin;
  // 确保路径以/开头
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${baseUrl}${path}`;
}

// 修改convertImageToBase64函数
async function convertImageToBase64(url: string): Promise<string> {
  try {
    const fullUrl = getFullResourceUrl(url);
    const response = await fetch(fullUrl, {
      mode: 'cors',
      credentials: 'same-origin',
      headers: {
        'Accept': 'image/*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('转换图片失败:', url, error);
    throw error;
  }
}

// 修改导出函数中的图片处理部分
export async function exportToPng(element: HTMLElement, filename: string) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    console.time('export-total');
    
    // 预处理所有图片
    const images = element.getElementsByTagName('img');
    const imageLoadPromises = Array.from(images).map(async (img) => {
      try {
        // 保存原始src
        const originalSrc = img.src;
        // 转换图片为base64
        const base64 = await convertImageToBase64(originalSrc);
        
        return new Promise<void>((resolve) => {
          const newImg = new Image();
          newImg.onload = () => {
            img.src = base64;
            resolve();
          };
          newImg.onerror = () => {
            console.warn(`图片加载失败: ${originalSrc}`);
            resolve();
          };
          newImg.src = base64;
        });
      } catch (error) {
        console.warn(`图片处理失败: ${img.src}`, error);
      }
    });

    // 等待所有图片加载完成
    await Promise.all(imageLoadPromises);
    console.log('所有图片加载和转换完成');

    // 使用html-to-image导出
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true,
      imagePlaceholder: '/placeholder-poster.png'
    });

    // 下载图片
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.timeEnd('export-total');
    console.log('导出成功完成');
  } catch (error) {
    console.error('导出失败:', error);
    throw new Error('导出图片失败');
  }
}
