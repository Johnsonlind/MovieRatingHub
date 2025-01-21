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

// 导出为PNG图片
export async function exportToPng(element: HTMLElement, filename: string) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    console.time('图片加载时间');
    const images = element.getElementsByTagName('img');
    console.log(`需要加载的图片数量: ${images.length}`);
    
    for(let i = 0; i < images.length; i++) {
      console.time(`图片${i+1}加载时间`);
      await new Promise(resolve => {
        if(images[i].complete) {
          resolve(null);
        } else {
          images[i].onload = () => resolve(null);
          images[i].onerror = () => resolve(null);
        }
      });
      console.timeEnd(`图片${i+1}加载时间`);
    }
    console.timeEnd('图片加载时间');

    console.time('导出时间');
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true
    });
    console.timeEnd('导出时间');

    // 下载图片
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('导出失败:', error);
    throw new Error('导出图片失败');
  }
}
