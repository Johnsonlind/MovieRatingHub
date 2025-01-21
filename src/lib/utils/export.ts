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
async function loadAndConvertImage(url: string): Promise<string> {
  try {
    if (url.startsWith('data:image')) {
      return url;
    }

    const absoluteUrl = url.startsWith('http') 
      ? url 
      : new URL(url, window.location.origin).href;

    const response = await fetch(absoluteUrl, {
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
    console.error('图片加载转换失败:', url, error);
    throw error;
  }
}

// 修改导出函数
export async function exportToPng(element: HTMLElement, filename: string) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    console.time('total-export');
    console.log('开始导出处理...');

    // 预处理所有图片元素
    const images = element.getElementsByTagName('img');
    console.log(`找到 ${images.length} 个图片需要处理`);

    // 获取所有需要处理的图片URL
    const imageUrls = [
      '/background.png',
      '/rating-template.png',
      '/logos/home.png',
      ...Array.from(images).map(img => img.src)
    ];

    // 预加载并转换所有图片
    const imageLoadPromises = imageUrls.map(async (url) => {
      try {
        const base64 = await loadAndConvertImage(url);
        // 如果是背景图片，更新元素的背景
        if (url.includes('background.png')) {
          element.style.backgroundImage = `url("${base64}")`;
        }
        // 如果是其他图片，更新对应的img元素
        else {
          const imgElement = Array.from(images).find(img => img.src.includes(url));
          if (imgElement) {
            imgElement.src = base64;
          }
        }
        return base64;
      } catch (error) {
        console.error(`图片处理失败: ${url}`, error);
        return null;
      }
    });

    console.time('images-loading');
    await Promise.all(imageLoadPromises);
    console.timeEnd('images-loading');
    console.log('所有图片加载完成');

    // 使用 html-to-image 导出
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      cacheBust: true,
      filter: (node) => {
        if (!(node instanceof Element)) return false;
        const style = window.getComputedStyle(node as HTMLElement);
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

    console.timeEnd('total-export');
    console.log('导出成功完成');
    return dataUrl;
  } catch (error) {
    console.error('导出过程中出错:', error);
    throw new Error('导出图片失败');
  }
}
