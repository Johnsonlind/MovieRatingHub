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

// 添加新的工具函数
async function convertImageToBase64(url: string): Promise<string> {
  try {
    // 如果不是完整URL，添加当前域名
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    
    const response = await fetch(fullUrl, {
      mode: 'cors',
      credentials: 'same-origin'
    });
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
        console.log('处理图片:', img.src);
        // 转换图片为 base64
        const base64 = await convertImageToBase64(img.src);
        img.src = base64;
        return new Promise<void>((resolve) => {
          img.onload = () => {
            console.log('图片加载成功:', img.src.substring(0, 50) + '...');
            resolve();
          };
          img.onerror = () => {
            console.warn(`图片加载失败: ${img.src.substring(0, 50)}...`);
            resolve();
          };
        });
      } catch (error) {
        console.warn(`图片处理失败: ${img.src}`, error);
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
      imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
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
