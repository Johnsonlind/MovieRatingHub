// ==========================================
// 图片导出工具
// ==========================================
import { toPng } from 'html-to-image';
import { getBase64Image } from '../api/image';

export const preloadImages = async (images: { poster?: string; cdnImages: string[] }) => {
  const promises = [];
  
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

  if (images.poster) {
    const posterPromise = getBase64Image(images.poster).catch((error: Error) => {
      console.warn('海报转换失败:', error);
      return images.poster;
    });
    promises.push(posterPromise);
  }

  await Promise.all(promises);
};

function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua) ||
         /iPad|iPhone|iPod/.test(ua) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function fixImageCrossOrigin(element: HTMLElement): void {
  const images = element.getElementsByTagName('img');
  Array.from(images).forEach(img => {
    if (img.hasAttribute('crossorigin')) {
      const src = img.src;
      const crossOrigin = img.getAttribute('crossorigin');
      
      img.removeAttribute('src');
      img.setAttribute('crossorigin', crossOrigin || 'anonymous');
      img.src = src;
    } else if (!img.src.startsWith('data:')) {
      const src = img.src;
      img.removeAttribute('src');
      img.setAttribute('crossorigin', 'anonymous');
      img.src = src;
    }
  });
}

async function waitForAllResources(element: HTMLElement): Promise<void> {
  const images = element.getElementsByTagName('img');
  await Promise.all(
    Array.from(images).map(
      img => img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(() => resolve(), 10000);
          })
    )
  );
  
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
    
    try {
      await Promise.all([
        document.fonts.load('1em ShangGuDengKuan'),
        document.fonts.load('1em Onest'),
        document.fonts.load('normal 400 1em ShangGuDengKuan'),
        document.fonts.load('normal 400 1em Onest'),
        document.fonts.load('bold 700 1em ShangGuDengKuan'),
        document.fonts.load('bold 700 1em Onest'),
      ]);
    } catch (error) {
      console.warn('字体加载警告:', error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  await new Promise(resolve => setTimeout(resolve, 200));
}

async function convertAllImagesToBase64ForSafari(element: HTMLElement): Promise<void> {
  const images = element.getElementsByTagName('img');
  const promises = Array.from(images).map(async (img) => {
    if (img.src.startsWith('data:')) {
      return;
    }
    
    let imageUrl = img.src;
    if (imageUrl.startsWith('/')) {
      imageUrl = window.location.origin + imageUrl;
    }
    
    try {
      const base64 = await getBase64Image(imageUrl);
      img.src = base64;
      
      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 5000);
        }
      });
    } catch (error) {
      console.warn('图片转换失败:', imageUrl, error);
    }
  });
  
  await Promise.all(promises);
}

function removeBackdropFilters(element: HTMLElement): void {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  function processElement(el: HTMLElement) {
    const computed = window.getComputedStyle(el);
    const backdropFilter = computed.getPropertyValue('backdrop-filter');
    const webkitBackdropFilter = computed.getPropertyValue('-webkit-backdrop-filter');
    
    if (backdropFilter !== 'none' || webkitBackdropFilter !== 'none') {
      const backgroundImage = computed.getPropertyValue('background-image');
      const hasGradient = backgroundImage && backgroundImage.includes('gradient');
      
      const inlineBackground = el.style.background || el.style.backgroundImage;
      const hasInlineGradient = inlineBackground && (inlineBackground.includes('gradient') || inlineBackground.includes('linear-gradient'));
      
      if (hasGradient || hasInlineGradient) {
        el.style.setProperty('backdrop-filter', 'none', 'important');
        el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        if (hasInlineGradient && el.style.background) {
        } else if (hasGradient) {
          el.style.setProperty('background', backgroundImage, 'important');
        }
      } else {
        let bgColor = computed.backgroundColor;
        if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
          const rootStyle = getComputedStyle(document.documentElement);
          const glassBg = rootStyle.getPropertyValue('--glass-bg').trim();
          if (glassBg) {
            bgColor = glassBg;
          } else {
            bgColor = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
          }
        }
        
        el.style.setProperty('backdrop-filter', 'none', 'important');
        el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        el.style.setProperty('background', bgColor, 'important');
        el.style.setProperty('background-color', bgColor, 'important');
      }
    }
    
    const allElements = el.querySelectorAll('*');
    allElements.forEach(child => {
      if (child instanceof HTMLElement) {
        const childComputed = window.getComputedStyle(child);
        const childBackdropFilter = childComputed.getPropertyValue('backdrop-filter');
        const childWebkitBackdropFilter = childComputed.getPropertyValue('-webkit-backdrop-filter');
        if (childBackdropFilter !== 'none' || childWebkitBackdropFilter !== 'none') {
          const childBackgroundImage = childComputed.getPropertyValue('background-image');
          const childHasGradient = childBackgroundImage && childBackgroundImage.includes('gradient');
          const childInlineBackground = child.style.background || child.style.backgroundImage;
          const childHasInlineGradient = childInlineBackground && (childInlineBackground.includes('gradient') || childInlineBackground.includes('linear-gradient'));
          
          if (childHasGradient || childHasInlineGradient) {
            child.style.setProperty('backdrop-filter', 'none', 'important');
            child.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            if (childHasInlineGradient && child.style.background) {
            } else if (childHasGradient) {
              child.style.setProperty('background', childBackgroundImage, 'important');
            }
          } else {
            let childBgColor = childComputed.backgroundColor;
            if (!childBgColor || childBgColor === 'rgba(0, 0, 0, 0)' || childBgColor === 'transparent') {
              const rootStyle = getComputedStyle(document.documentElement);
              const glassBg = rootStyle.getPropertyValue('--glass-bg').trim();
              childBgColor = glassBg || (isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)');
            }
            child.style.setProperty('backdrop-filter', 'none', 'important');
            child.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            child.style.setProperty('background', childBgColor, 'important');
            child.style.setProperty('background-color', childBgColor, 'important');
          }
        }
      }
    });
  }
  
  processElement(element);
  element.offsetHeight;
}

function forceRepaint(element: HTMLElement): void {
  element.style.display = 'none';
  element.offsetHeight;
  element.style.display = '';
  element.offsetHeight;
}

async function compressImage(dataUrl: string, targetSizeMB: number = 10): Promise<string> {
  return new Promise((resolve, reject) => {
    const base64Size = dataUrl.length;
    const estimatedSize = (base64Size * 3) / 4;
    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    
    if (estimatedSize <= targetSizeBytes * 1.1) {
      console.log('文件大小已合适，无需压缩');
      resolve(dataUrl);
      return;
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
      }
      
      let width = img.width;
      let height = img.height;
      const originalWidth = width;
      const originalHeight = height;
      
      const checkSize = (w: number, h: number): Promise<string> => {
        return new Promise((resolveCheck) => {
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          
          canvas.toBlob((blob) => {
            if (!blob) {
              resolveCheck(canvas.toDataURL('image/png'));
              return;
            }
            
            const size = blob.size;
            console.log(`压缩检查: ${w}x${h}, 文件大小: ${(size / 1024 / 1024).toFixed(2)}MB`);
            
            if (size <= targetSizeBytes * 1.1) {
              const reader = new FileReader();
              reader.onloadend = () => resolveCheck(reader.result as string);
              reader.onerror = () => resolveCheck(canvas.toDataURL('image/png'));
              reader.readAsDataURL(blob);
            } else {
              const ratio = Math.sqrt((targetSizeBytes * 1.1) / size);
              const newWidth = Math.floor(w * ratio);
              const newHeight = Math.floor(h * ratio);
              
              const minWidth = Math.floor(originalWidth * 0.6);
              const minHeight = Math.floor(originalHeight * 0.6);
              
              if (newWidth < minWidth || newHeight < minHeight) {
                const finalWidth = Math.max(newWidth, minWidth);
                const finalHeight = Math.max(newHeight, minHeight);
                console.log(`达到最小尺寸限制，使用: ${finalWidth}x${finalHeight}`);
                checkSize(finalWidth, finalHeight).then(resolveCheck);
              } else {
                checkSize(newWidth, newHeight).then(resolveCheck);
              }
            }
          }, 'image/png');
        });
      };
      
      checkSize(width, height).then(resolve).catch(reject);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

async function applyRoundedCorners(dataUrl: string, borderRadius: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const x = 0;
      const y = 0;
      const w = canvas.width;
      const h = canvas.height;
      const r = Math.min(borderRadius, Math.min(w, h) / 2);
      
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      
      ctx.save();
      ctx.clip();
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      
      const roundedDataUrl = canvas.toDataURL('image/png');
      resolve(roundedDataUrl);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

function removeBoxShadows(element: HTMLElement): () => void {
  const shadowMap = new Map<HTMLElement, string>();
  
  const computed = window.getComputedStyle(element);
  if (computed.boxShadow && computed.boxShadow !== 'none') {
    shadowMap.set(element, element.style.boxShadow || '');
    element.style.boxShadow = 'none';
  }
  
  const allElements = element.querySelectorAll('*');
  allElements.forEach((el) => {
    if (el instanceof HTMLElement) {
      const elComputed = window.getComputedStyle(el);
      if (elComputed.boxShadow && elComputed.boxShadow !== 'none') {
        shadowMap.set(el, el.style.boxShadow || '');
        el.style.boxShadow = 'none';
      }
    }
  });
  
  return () => {
    shadowMap.forEach((originalShadow, el) => {
      if (originalShadow) {
        el.style.boxShadow = originalShadow;
      } else {
        el.style.removeProperty('box-shadow');
      }
    });
  };
}

async function exportWithSnapdom(element: HTMLElement, filename: string, isChart: boolean = false, borderRadius: number = 20): Promise<void> {
  const snapdomModule = await import('@zumer/snapdom');
  const snapdom = snapdomModule as any;
  
  const originalOverflow = element.style.overflow;
  const originalBorderRadius = element.style.borderRadius;
  
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${borderRadius}px`;
  
  const restoreShadows = removeBoxShadows(element);
  
  fixImageCrossOrigin(element);
  
  console.log('Safari: 开始转换所有图片为base64...');
  await convertAllImagesToBase64ForSafari(element);
  console.log('Safari: 图片转换完成');
  
  await waitForAllResources(element);
  
  if (!isChart) {
    console.log('Safari: 移除backdrop-filter...');
    removeBackdropFilters(element);
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(undefined);
        });
      });
    });
  }
  
  forceRepaint(element);
  
  const waitTime = isChart ? 1000 : 3000;
  await new Promise(resolve => setTimeout(resolve, waitTime));
  
  forceRepaint(element);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const scale = isChart ? 1.5 : 2;
  
  console.log('Safari: 开始使用snapdom导出，scale:', scale);
  
  const imgElement = await snapdom.snapdom.toPng(element, {
    scale: scale,
    backgroundColor: 'transparent',
    useProxy: '/api/image-proxy?url={url}',
    embedFonts: true,
  });
  
  console.log('Safari: snapdom导出完成，图片尺寸:', imgElement.width, 'x', imgElement.height);
  
  element.style.overflow = originalOverflow;
  element.style.borderRadius = originalBorderRadius;
  restoreShadows();
  
  let dataUrl = imgElement.src;
  
  const scaledBorderRadius = borderRadius * scale;
  console.log('Safari: 应用圆角，半径:', scaledBorderRadius);
  dataUrl = await applyRoundedCorners(dataUrl, scaledBorderRadius);
  
  console.log('Safari: 开始压缩图片...');
  dataUrl = await compressImage(dataUrl, 10);
  console.log('Safari: 图片压缩完成');
  
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function exportWithHtmlToImage(element: HTMLElement, filename: string, isChart: boolean = false, borderRadius: number = 20): Promise<void> {
  const originalOverflow = element.style.overflow;
  const originalBorderRadius = element.style.borderRadius;
  
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${borderRadius}px`;
  
  const restoreShadows = removeBoxShadows(element);
  
  await waitForAllResources(element);
  
  const pixelRatio = isChart ? 1.5 : 2;
  
  let dataUrl = await toPng(element, {
    quality: 1.0,
    pixelRatio: pixelRatio,
    skipAutoScale: true,
    cacheBust: true,
    backgroundColor: 'transparent',
    style: {
      background: 'transparent',
    },
    filter: (node) => {
      if (node instanceof HTMLElement) {
        const tagName = node.tagName?.toLowerCase();
        if (tagName === 'script' || tagName === 'style') {
          return false;
        }
      }
      return true;
    }
  });
  
  element.style.overflow = originalOverflow;
  element.style.borderRadius = originalBorderRadius;
  restoreShadows();
  
  const scaledBorderRadius = borderRadius * pixelRatio;
  console.log('Chrome: 应用圆角，半径:', scaledBorderRadius);
  dataUrl = await applyRoundedCorners(dataUrl, scaledBorderRadius);
  
  console.log('Chrome: 开始压缩图片...');
  dataUrl = await compressImage(dataUrl, 10);
  console.log('Chrome: 图片压缩完成');
  
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportToPng(element: HTMLElement, filename: string, options?: { isChart?: boolean; borderRadius?: number }) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    const isSafariBrowser = isSafari();
    const isChart = options?.isChart || false;
    const borderRadius = options?.borderRadius ?? (isChart ? 20 : 24);
    
    console.log('开始导出，浏览器:', isSafariBrowser ? 'Safari' : '其他', '类型:', isChart ? '榜单' : '评分卡片', '圆角:', borderRadius);
    
    if (isSafariBrowser) {
      await exportWithSnapdom(element, filename, isChart, borderRadius);
    } else {
      await exportWithHtmlToImage(element, filename, isChart, borderRadius);
    }
    
    console.log('导出成功');
  } catch (error) {
    console.error('导出PNG失败:', error);
    throw error;
  }
}
