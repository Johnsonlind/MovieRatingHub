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
    console.time('total-export');
    
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
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true,
      onclone: () => {
        console.timeEnd('html-to-image-clone');
        console.time('html-to-image-process');
      },
      filter: (node) => {
        // 过滤掉不需要的节点，如隐藏元素
        const element = node as HTMLElement;
        return element.style?.display !== 'none';
      }
    });
    console.timeEnd('html-to-image-process');
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
    console.error('导出失败:', error);
    throw new Error('导出图片失败');
  }
}
