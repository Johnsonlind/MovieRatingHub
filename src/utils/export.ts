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

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (!!navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
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
  const isMobile = isMobileDevice();
  const imageTimeout = isMobile ? 3000 : 5000;
  
  const images = element.getElementsByTagName('img');
  await Promise.all(
    Array.from(images).map(
      img => img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(() => resolve(), imageTimeout);
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
    
    await new Promise(resolve => setTimeout(resolve, isMobile ? 100 : 200));
  }
  
  await new Promise(resolve => setTimeout(resolve, isMobile ? 50 : 100));
}

async function convertAllImagesToBase64ForSafari(element: HTMLElement): Promise<void> {
  const isMobile = isMobileDevice();
  const timeout = isMobile ? 3000 : 5000;
  
  const images = element.getElementsByTagName('img');
  const maxConcurrent = isMobile ? 3 : 10;
  const imageArray = Array.from(images).filter(img => !img.src.startsWith('data:'));
  
  for (let i = 0; i < imageArray.length; i += maxConcurrent) {
    const batch = imageArray.slice(i, i + maxConcurrent);
    await Promise.all(batch.map(async (img) => {
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
            setTimeout(() => resolve(), timeout);
          }
        });
      } catch (error) {
        console.warn('图片转换失败:', imageUrl, error);
      }
    }));

    if (isMobile && i + maxConcurrent < imageArray.length) {
      await yieldToMain();
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
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
  return new Promise(async (resolve, reject) => {
    const base64Size = dataUrl.length;
    const estimatedSize = (base64Size * 3) / 4;
    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    const isMobile = isMobileDevice();
    
    if (estimatedSize <= targetSizeBytes * 1.1) {
      console.log('文件大小已合适，无需压缩');
      resolve(dataUrl);
      return;
    }
    
    await yieldToMain();
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      await yieldToMain();
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { 
        willReadFrequently: false,
        alpha: true,
        desynchronized: isMobile ? true : false
      });
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
      }
      
      let width = img.width;
      let height = img.height;
      const originalWidth = width;
      const originalHeight = height;
      
      const maxIterations = isMobile ? 3 : 10;
      let iterationCount = 0;
      
      const checkSize = async (w: number, h: number): Promise<string> => {
        if (iterationCount > 0) {
          await yieldToMain();
        }
        
        return new Promise((resolveCheck) => {
          if (iterationCount >= maxIterations) {
            console.log('达到最大迭代次数，使用当前尺寸');
            canvas.width = w;
            canvas.height = h;
            ctx.clearRect(0, 0, w, h);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = isMobile ? 'medium' : 'high';
            ctx.drawImage(img, 0, 0, w, h);
            resolveCheck(canvas.toDataURL('image/png', isMobile ? 0.85 : 0.95));
            return;
          }
          
          iterationCount++;
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = isMobile ? 'medium' : 'high';
          ctx.drawImage(img, 0, 0, w, h);
          
          const quality = isMobile ? 0.85 : 0.95;
          canvas.toBlob(async (blob) => {
            if (!blob) {
              resolveCheck(canvas.toDataURL('image/png', quality));
              return;
            }
            
            const size = blob.size;
            console.log(`压缩检查: ${w}x${h}, 文件大小: ${(size / 1024 / 1024).toFixed(2)}MB`);
            
            if (size <= targetSizeBytes * 1.1) {
              const reader = new FileReader();
              reader.onloadend = () => resolveCheck(reader.result as string);
              reader.onerror = () => resolveCheck(canvas.toDataURL('image/png', quality));
              reader.readAsDataURL(blob);
            } else {
              const compressionRatio = isMobile ? 0.75 : Math.sqrt((targetSizeBytes * 1.1) / size);
              const newWidth = Math.floor(w * compressionRatio);
              const newHeight = Math.floor(h * compressionRatio);
              
              const minWidth = Math.floor(originalWidth * (isMobile ? 0.5 : 0.6));
              const minHeight = Math.floor(originalHeight * (isMobile ? 0.5 : 0.6));
              
              if (newWidth < minWidth || newHeight < minHeight) {
                const finalWidth = Math.max(newWidth, minWidth);
                const finalHeight = Math.max(newHeight, minHeight);
                console.log(`达到最小尺寸限制，使用: ${finalWidth}x${finalHeight}`);
                const result = await checkSize(finalWidth, finalHeight);
                resolveCheck(result);
              } else {
                const result = await checkSize(newWidth, newHeight);
                resolveCheck(result);
              }
            }
          }, 'image/png', quality);
        });
      };
      
      const result = await checkSize(width, height);
      resolve(result);
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

      const width = Math.floor(img.width);
      const height = Math.floor(img.height);
      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);

      const inset = -1;
      const x = inset;
      const y = inset;
      const w = width - inset * 2;
      const h = height - inset * 2;

      const r = Math.max(
        0,
        Math.min(borderRadius - inset, Math.min(w, h) / 2)
      );

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

      ctx.drawImage(img, x, y, w, h);

      ctx.restore();

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

/**
 * 显示图片预览弹窗（用于移动端长按保存）
 */
function showImagePreview(dataUrl: string, filename: string): void {
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.3s ease;
  `;

  // 创建提示文字
  const hint = document.createElement('div');
  hint.style.cssText = `
    color: white;
    font-size: 16px;
    text-align: center;
    margin-bottom: 20px;
    padding: 15px 20px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    backdrop-filter: blur(10px);
    line-height: 1.5;
  `;
  hint.innerHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">📱 保存图片到相册</div>
    <div>👇 长按下方图片</div>
    <div>选择"保存图片"或"添加到相册"</div>
  `;

  // 创建图片容器
  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = `
    max-width: 90%;
    max-height: 70vh;
    overflow: auto;
    border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  `;

  // 创建图片
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = filename;
  img.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
    border-radius: 10px;
  `;

  // 创建关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = `
    margin-top: 20px;
    padding: 12px 30px;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 25px;
    font-size: 16px;
    cursor: pointer;
    backdrop-filter: blur(10px);
  `;

  closeBtn.onclick = () => {
    overlay.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => document.body.removeChild(overlay), 300);
  };

  // 点击遮罩层也关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeBtn.click();
    }
  };

  imgContainer.appendChild(img);
  overlay.appendChild(hint);
  overlay.appendChild(imgContainer);
  overlay.appendChild(closeBtn);

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(overlay);
  console.log('显示图片预览弹窗');
}

/**
 * 检测是否为微信浏览器
 */
function isWeChat(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent);
}

/**
 * 下载图片 - 兼容移动端浏览器
 * @param dataUrl - 图片的 data URL
 * @param filename - 文件名
 * @param isMobile - 是否为移动设备
 */
async function downloadImage(dataUrl: string, filename: string, isMobile: boolean): Promise<void> {
  if (isMobile) {
    const isWeChatBrowser = isWeChat();
    
    console.log('浏览器检测:', { 
      isWeChat: isWeChatBrowser,
      userAgent: navigator.userAgent 
    });

    if (isWeChatBrowser) {
      console.log('检测到微信浏览器，显示长按保存提示');
      showImagePreview(dataUrl, filename);
      return;
    }

    console.log('移动浏览器：显示预览窗口供用户长按保存');
    showImagePreview(dataUrl, filename);
  } else {
    // 桌面端直接下载
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('桌面端下载成功');
  }
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
  const isMobile = isMobileDevice();

  await yieldToMain();
  
  const originalOverflow = element.style.overflow;
  const originalBorderRadius = element.style.borderRadius;
  
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${borderRadius}px`;
  
  const restoreShadows = removeBoxShadows(element);
  
  fixImageCrossOrigin(element);
  
  console.log('Safari: 开始转换所有图片为base64...');
  await convertAllImagesToBase64ForSafari(element);
  console.log('Safari: 图片转换完成');

  await yieldToMain();
  
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

  await yieldToMain();
  
  forceRepaint(element);
  
  const waitTime = isChart ? (isMobile ? 300 : 800) : (isMobile ? 500 : 2000);
  await new Promise(resolve => setTimeout(resolve, waitTime));

  await yieldToMain();
  
  forceRepaint(element);
  await new Promise(resolve => setTimeout(resolve, isMobile ? 100 : 300));

  const baseScale = isChart ? 1.5 : 2;
  const scale = isMobile ? Math.max(1.0, baseScale * 0.7) : baseScale;
  
  console.log('Safari: 开始使用snapdom导出，scale:', scale, isMobile ? '(移动端优化)' : '');
  
  await yieldToMain();
  
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

  await yieldToMain();
  
  let dataUrl = imgElement.src;
  
  const scaledBorderRadius = borderRadius * scale;
  console.log('Safari: 应用圆角，半径:', scaledBorderRadius);
  dataUrl = await applyRoundedCorners(dataUrl, scaledBorderRadius);

  await yieldToMain();
  
  console.log('Safari: 开始压缩图片...');
  dataUrl = await compressImage(dataUrl, isMobile ? 5 : 10);
  console.log('Safari: 图片压缩完成');

  await yieldToMain();
  
  await downloadImage(dataUrl, filename, isMobile);
}

async function exportWithHtmlToImage(element: HTMLElement, filename: string, isChart: boolean = false, borderRadius: number = 20): Promise<void> {
  const isMobile = isMobileDevice();

  await yieldToMain();
  
  const originalOverflow = element.style.overflow;
  const originalBorderRadius = element.style.borderRadius;
  
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${borderRadius}px`;
  
  const restoreShadows = removeBoxShadows(element);
  
  await waitForAllResources(element);
  
  await yieldToMain();

  const basePixelRatio = isChart ? 1.5 : 2;
  const pixelRatio = isMobile ? Math.max(1.0, basePixelRatio * 0.7) : basePixelRatio;
  
  console.log('Chrome: 开始导出，pixelRatio:', pixelRatio, isMobile ? '(移动端优化)' : '');

  await yieldToMain();
  
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

  await yieldToMain();
  
  const scaledBorderRadius = borderRadius * pixelRatio;
  console.log('Chrome: 应用圆角，半径:', scaledBorderRadius);
  dataUrl = await applyRoundedCorners(dataUrl, scaledBorderRadius);

  await yieldToMain();
  
  console.log('Chrome: 开始压缩图片...');
  dataUrl = await compressImage(dataUrl, isMobile ? 5 : 10);
  console.log('Chrome: 图片压缩完成');

  await yieldToMain();
  
  await downloadImage(dataUrl, filename, isMobile);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(() => resolve(), 0);
    });
  });
}

export async function exportToPng(element: HTMLElement, filename: string, options?: { isChart?: boolean; borderRadius?: number }) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    await yieldToMain();
    
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
