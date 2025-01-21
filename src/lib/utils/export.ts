import { toPng } from 'html-to-image';
import { getBase64Image } from './image';

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
    // 等待所有图片加载完成
    const images = element.getElementsByTagName('img');
    console.log(`需要加载的图片数量: ${images.length}`);
    
    // 预处理所有TMDB图片
    for(let i = 0; i < images.length; i++) {
      const img = images[i];
      if(img.src.includes('image.tmdb.org')) {
        console.time(`图片${i+1}加载时间`);
        try {
          // 使用getBase64Image处理TMDB图片
          const base64Data = await getBase64Image(img.src);
          img.src = base64Data;
        } catch(error) {
          console.error(`图片${i+1}加载失败:`, error);
        }
        console.timeEnd(`图片${i+1}加载时间`);
      }
    }

    console.log('所有图片加载完成,开始导出...');

    // 使用 html-to-image 导出
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true
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
