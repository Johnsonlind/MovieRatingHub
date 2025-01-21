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
    console.log('开始导出过程');
    
    // 克隆元素以避免修改原始DOM
    const clonedElement = element.cloneNode(true) as HTMLElement;
    document.body.appendChild(clonedElement);
    clonedElement.style.position = 'absolute';
    clonedElement.style.left = '-9999px';
    
    // 等待所有图片加载完成
    const images = clonedElement.getElementsByTagName('img');
    console.log(`需要加载的图片数量: ${images.length}`);
    
    // 并行处理所有TMDB图片，使用Promise.all提高效率
    const imagePromises = Array.from(images).map(async (img, index) => {
      if(img.src.includes('image.tmdb.org')) {
        try {
          const base64Data = await getBase64Image(img.src);
          img.src = base64Data;
          await new Promise(resolve => {
            img.onload = resolve;
          });
        } catch(error) {
          console.error(`图片${index+1}加载失败:`, error);
        }
      }
    });

    await Promise.all(imagePromises);
    console.log('所有图片加载完成,开始导出...');

    // 直接使用toPng，避免Canvas中间转换步骤
    const dataUrl = await toPng(clonedElement, {
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

    // 清理
    document.body.removeChild(clonedElement);
    console.log('导出成功完成');
  } catch (error) {
    console.error('导出失败:', error);
    throw new Error('导出图片失败');
  }
}
