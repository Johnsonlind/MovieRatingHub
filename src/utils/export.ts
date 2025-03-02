// ==========================================
// 导出图片
// ==========================================
import { toPng } from 'html-to-image';
import { getBase64Image } from '../api/image';


// 分别处理 TMDB 图片和 CDN 图片
export const preloadImages = async (images: { poster?: string; cdnImages: string[] }) => {
  const promises = [];
  
  // CDN 图片预加载
  const cdnPromises = images.cdnImages.map(url => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
  });
  promises.push(...cdnPromises);

  // 如果有海报图片，则预加载
  if (images.poster) {
    const posterPromise = getBase64Image(images.poster).catch((error: Error) => {
      console.warn('海报转换失败:', error);
      return images.poster;
    });
    promises.push(posterPromise);
  }

  await Promise.all(promises);
};

// 导出为PNG图片
export async function exportToPng(element: HTMLElement, filename: string) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    // 检测是否为Safari浏览器
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    // 等待所有图片加载完成
    const images = element.getElementsByTagName('img');
    await Promise.all(
      Array.from(images).map(
        img => img.complete || new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        })
      )
    );

    console.log('所有图片加载完成,开始导出...');

    // Safari需要多次尝试
    if (isSafari) {
      console.log('检测到Safari浏览器,将进行多次导出尝试...');
      const attempts = 3;
      
      for (let i = 0; i < attempts; i++) {
        try {
          const dataUrl = await toPng(element, {
            quality: 1.0,
            pixelRatio: 2,
            skipAutoScale: true,
            cacheBust: true
          });
          
          // 最后一次尝试才真正下载
          if (i === attempts - 1) {
            const link = document.createElement('a');
            link.download = filename;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          
          // 添加短暂延迟
          if (i < attempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`第${i + 1}次导出尝试失败:`, error);
          if (i === attempts - 1) throw error;
        }
      }
    } else {
      // 非Safari浏览器只需要导出一次
      const dataUrl = await toPng(element, {
        quality: 1.0,
        pixelRatio: 2,
        skipAutoScale: true,
        cacheBust: true
      });
      
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error('导出PNG失败:', error);
    throw error;
  }
}