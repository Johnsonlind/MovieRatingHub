import { toCanvas } from 'html-to-image';
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
    console.log('DOM元素大小:', {
      width: element.offsetWidth,
      height: element.offsetHeight
    });
    console.log('DOM元素内容:', {
      childNodes: element.childNodes.length,
      images: element.getElementsByTagName('img').length,
      totalElements: element.getElementsByTagName('*').length
    });

    // 克隆元素以避免修改原始DOM
    const clonedElement = element.cloneNode(true) as HTMLElement;
    
    // 等待所有图片加载完成
    const images = clonedElement.getElementsByTagName('img');
    console.log(`需要加载的图片数量: ${images.length}`);
    
    // 并行处理所有TMDB图片
    const imagePromises = Array.from(images).map(async (img, index) => {
      if(img.src.includes('image.tmdb.org')) {
        console.time(`图片${index+1}加载时间`);
        try {
          const base64Data = await getBase64Image(img.src);
          img.src = base64Data;
        } catch(error) {
          console.error(`图片${index+1}加载失败:`, error);
        }
        console.timeEnd(`图片${index+1}加载时间`);
      }
    });

    // 等待所有图片处理完成
    await Promise.all(imagePromises);
    console.log('所有图片加载完成,开始导出...');

    // 添加性能标记
    performance.mark('canvas-start');

    // 直接转换为Canvas，添加优化选项
    const canvas = await toCanvas(clonedElement, {
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true,
      filter: (node) => {
        const element = node as HTMLElement;
        if (!element.style) return true;
        const computedStyle = window.getComputedStyle(element);
        return computedStyle.display !== 'none' && 
               computedStyle.visibility !== 'hidden';
      }
    });

    performance.mark('canvas-done');
    
    // 优化Canvas转PNG的过程
    performance.mark('png-start');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 在转换前优化Canvas上下文
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    performance.mark('png-done');

    // 计算各阶段耗时
    const canvasTime = performance.measure('canvas-time', 'canvas-start', 'canvas-done');
    const pngTime = performance.measure('png-time', 'png-start', 'png-done');
    
    console.log('Canvas生成时间:', canvasTime.duration, 'ms');
    console.log('PNG转换时间:', pngTime.duration, 'ms');
    console.log('生成的dataUrl长度:', dataUrl.length);

    // 下载图片
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理
    performance.clearMarks();
    performance.clearMeasures();
    clonedElement.remove();

    console.log('导出成功完成');
  } catch (error) {
    console.error('导出失败:', error);
    throw new Error('导出图片失败');
  }
}
