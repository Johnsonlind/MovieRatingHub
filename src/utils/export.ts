// ==========================================
// 图片导出工具 - 将评分卡片导出为PNG图片
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

// 检测是否为Safari浏览器
function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua) ||
         /iPad|iPhone|iPod/.test(ua) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// 修复Safari中的crossOrigin问题 - 必须在src之前设置
function fixImageCrossOrigin(element: HTMLElement): void {
  const images = element.getElementsByTagName('img');
  Array.from(images).forEach(img => {
    // 如果已经有crossOrigin属性，确保它在src之前
    if (img.hasAttribute('crossorigin')) {
      const src = img.src;
      const crossOrigin = img.getAttribute('crossorigin');
      
      // 移除src，设置crossOrigin，然后重新设置src
      img.removeAttribute('src');
      img.setAttribute('crossorigin', crossOrigin || 'anonymous');
      img.src = src;
    } else if (!img.src.startsWith('data:')) {
      // 对于非base64图片，添加crossOrigin
      const src = img.src;
      img.removeAttribute('src');
      img.setAttribute('crossorigin', 'anonymous');
      img.src = src;
    }
  });
}

// 等待所有资源加载完成
async function waitForAllResources(element: HTMLElement): Promise<void> {
  // 等待图片
  const images = element.getElementsByTagName('img');
  await Promise.all(
    Array.from(images).map(
      img => img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            // 超时保护
            setTimeout(() => resolve(), 10000);
          })
    )
  );
  
  // 等待字体加载完成 - 确保自定义字体已加载
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
    
    // 显式加载自定义字体
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
    
    // 额外等待确保字体已应用
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // 额外等待确保渲染完成
  await new Promise(resolve => setTimeout(resolve, 200));
}

// 将所有图片转换为base64（Safari必需）
async function convertAllImagesToBase64ForSafari(element: HTMLElement): Promise<void> {
  const images = element.getElementsByTagName('img');
  const promises = Array.from(images).map(async (img) => {
    // 如果已经是base64，跳过
    if (img.src.startsWith('data:')) {
      return;
    }
    
    // 获取完整的图片URL
    let imageUrl = img.src;
    // 如果是相对路径，转换为完整URL
    if (imageUrl.startsWith('/')) {
      imageUrl = window.location.origin + imageUrl;
    }
    
    try {
      const base64 = await getBase64Image(imageUrl);
      img.src = base64;
      
      // 等待图片重新加载
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

// 移除backdrop-filter（Safari导出必需）
function removeBackdropFilters(element: HTMLElement): void {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  // 递归处理所有元素
  function processElement(el: HTMLElement) {
    const computed = window.getComputedStyle(el);
    const backdropFilter = computed.getPropertyValue('backdrop-filter');
    const webkitBackdropFilter = computed.getPropertyValue('-webkit-backdrop-filter');
    
    // 如果有backdrop-filter，移除它并用纯色背景替代
    if (backdropFilter !== 'none' || webkitBackdropFilter !== 'none') {
      // 获取当前背景色
      let bgColor = computed.backgroundColor;
      if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
        // 从CSS变量获取或使用默认值
        const rootStyle = getComputedStyle(document.documentElement);
        const glassBg = rootStyle.getPropertyValue('--glass-bg').trim();
        if (glassBg) {
          bgColor = glassBg;
        } else {
          bgColor = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        }
      }
      
      // 设置纯色背景，移除backdrop-filter
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      el.style.setProperty('background', bgColor, 'important');
      el.style.setProperty('background-color', bgColor, 'important');
    }
    
    // 处理所有子元素（包括SVG）
    const allElements = el.querySelectorAll('*');
    allElements.forEach(child => {
      if (child instanceof HTMLElement) {
        const childComputed = window.getComputedStyle(child);
        const childBackdropFilter = childComputed.getPropertyValue('backdrop-filter');
        const childWebkitBackdropFilter = childComputed.getPropertyValue('-webkit-backdrop-filter');
        if (childBackdropFilter !== 'none' || childWebkitBackdropFilter !== 'none') {
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
    });
  }
  
  processElement(element);
  
  // 强制重排确保样式生效
  element.offsetHeight;
}

// 强制重绘元素（确保Safari正确渲染）
function forceRepaint(element: HTMLElement): void {
  // 触发重排和重绘
  element.style.display = 'none';
  element.offsetHeight; // 触发重排
  element.style.display = '';
  element.offsetHeight; // 再次触发重排
}

// 对图片应用圆角和透明背景
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
      
      // 先清除画布，确保透明背景
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 使用更精确的圆角路径 - 使用 arcTo 方法
      const x = 0;
      const y = 0;
      const w = canvas.width;
      const h = canvas.height;
      const r = Math.min(borderRadius, Math.min(w, h) / 2); // 确保圆角不超过尺寸的一半
      
      // 创建圆角矩形路径
      ctx.beginPath();
      // 从左上角开始
      ctx.moveTo(x + r, y);
      // 上边
      ctx.lineTo(x + w - r, y);
      // 右上角圆角
      ctx.arcTo(x + w, y, x + w, y + r, r);
      // 右边
      ctx.lineTo(x + w, y + h - r);
      // 右下角圆角
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      // 下边
      ctx.lineTo(x + r, y + h);
      // 左下角圆角
      ctx.arcTo(x, y + h, x, y + h - r, r);
      // 左边
      ctx.lineTo(x, y + r);
      // 左上角圆角
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      
      // 保存状态
      ctx.save();
      
      // 裁剪为圆角
      ctx.clip();
      
      // 绘制图片（只绘制在裁剪区域内）
      ctx.drawImage(img, 0, 0);
      
      // 恢复状态
      ctx.restore();
      
      // 导出为PNG（透明背景）
      const roundedDataUrl = canvas.toDataURL('image/png');
      resolve(roundedDataUrl);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

// 移除元素及其子元素的 box-shadow，返回恢复函数
function removeBoxShadows(element: HTMLElement): () => void {
  const shadowMap = new Map<HTMLElement, string>();
  
  // 移除元素本身的 box-shadow
  const computed = window.getComputedStyle(element);
  if (computed.boxShadow && computed.boxShadow !== 'none') {
    shadowMap.set(element, element.style.boxShadow || '');
    element.style.boxShadow = 'none';
  }
  
  // 递归移除所有子元素的 box-shadow
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
  
  // 返回恢复函数
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

// 使用snapdom导出（Safari兼容）
async function exportWithSnapdom(element: HTMLElement, filename: string, isChart: boolean = false, borderRadius: number = 20): Promise<void> {
  // 动态导入snapdom模块
  const snapdomModule = await import('@zumer/snapdom');
  // snapdom是命名空间，toPng是命名空间的静态方法
  // 使用类型断言访问命名空间方法
  const snapdom = snapdomModule as any;
  
  // 保存原始样式
  const originalOverflow = element.style.overflow;
  const originalBorderRadius = element.style.borderRadius;
  
  // 临时设置 overflow 和 borderRadius 确保内容不溢出
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${borderRadius}px`;
  
  // 移除 box-shadow 防止阴影溢出
  const restoreShadows = removeBoxShadows(element);
  
  // 修复crossOrigin问题
  fixImageCrossOrigin(element);
  
  // Safari中必须将所有图片转换为base64
  console.log('Safari: 开始转换所有图片为base64...');
  await convertAllImagesToBase64ForSafari(element);
  console.log('Safari: 图片转换完成');
  
  // 等待所有资源
  await waitForAllResources(element);
  
  // 对于评分卡片，移除backdrop-filter（可能导致Safari导出失败）
  if (!isChart) {
    console.log('Safari: 移除backdrop-filter...');
    removeBackdropFilters(element);
    // 移除backdrop-filter后需要等待重新渲染
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(undefined);
        });
      });
    });
  }
  
  // 强制重绘确保所有内容都正确渲染
  forceRepaint(element);
  
  // 额外等待确保base64图片已渲染（评分卡片需要更长时间）
  const waitTime = isChart ? 1000 : 3000;
  await new Promise(resolve => setTimeout(resolve, waitTime));
  
  // 再次强制重绘
  forceRepaint(element);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 榜单使用较低分辨率，评分卡片使用高分辨率
  const scale = isChart ? 1.5 : 2;
  
  console.log('Safari: 开始使用snapdom导出，scale:', scale);
  
  // 使用snapdom导出 - toPng返回HTMLImageElement，需要从src获取dataUrl
  // snapdom命名空间的toPng静态方法
  // 注意：使用透明背景
  const imgElement = await snapdom.snapdom.toPng(element, {
    scale: scale,
    backgroundColor: 'transparent',
    // 使用代理处理跨域图片
    useProxy: '/api/image-proxy?url={url}',
    // 嵌入字体以确保文字正确显示
    embedFonts: true,
  });
  
  console.log('Safari: snapdom导出完成，图片尺寸:', imgElement.width, 'x', imgElement.height);
  
  // 恢复原始样式
  element.style.overflow = originalOverflow;
  element.style.borderRadius = originalBorderRadius;
  restoreShadows();
  
  // 从image元素的src获取dataUrl
  let dataUrl = imgElement.src;
  
  // 应用圆角（根据scale调整borderRadius）
  const scaledBorderRadius = borderRadius * scale;
  console.log('Safari: 应用圆角，半径:', scaledBorderRadius);
  dataUrl = await applyRoundedCorners(dataUrl, scaledBorderRadius);
  
  // 下载
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 使用html-to-image导出（Chrome等浏览器）
async function exportWithHtmlToImage(element: HTMLElement, filename: string, isChart: boolean = false, borderRadius: number = 20): Promise<void> {
  // 保存原始样式
  const originalOverflow = element.style.overflow;
  const originalBorderRadius = element.style.borderRadius;
  
  // 临时设置 overflow 和 borderRadius 确保内容不溢出
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${borderRadius}px`;
  
  // 移除 box-shadow 防止阴影溢出
  const restoreShadows = removeBoxShadows(element);
  
  // 等待所有资源
  await waitForAllResources(element);
  
  // 榜单使用较低分辨率，评分卡片使用高分辨率
  const pixelRatio = isChart ? 1.5 : 2;
  
  // 使用html-to-image导出，使用透明背景
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
  
  // 恢复原始样式
  element.style.overflow = originalOverflow;
  element.style.borderRadius = originalBorderRadius;
  restoreShadows();
  
  // 应用圆角（根据pixelRatio调整borderRadius）
  const scaledBorderRadius = borderRadius * pixelRatio;
  console.log('Chrome: 应用圆角，半径:', scaledBorderRadius);
  dataUrl = await applyRoundedCorners(dataUrl, scaledBorderRadius);
  
  // 下载
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 导出为PNG图片
export async function exportToPng(element: HTMLElement, filename: string, options?: { isChart?: boolean; borderRadius?: number }) {
  if (!element) {
    throw new Error('导出元素不存在');
  }

  try {
    const isSafariBrowser = isSafari();
    const isChart = options?.isChart || false;
    // 评分卡片使用24px圆角，榜单使用20px圆角
    const borderRadius = options?.borderRadius ?? (isChart ? 20 : 24);
    
    console.log('开始导出，浏览器:', isSafariBrowser ? 'Safari' : '其他', '类型:', isChart ? '榜单' : '评分卡片', '圆角:', borderRadius);
    
    // Safari使用snapdom，其他浏览器使用html-to-image
    // 这样可以确保Safari和Chrome都能得到完全一样的结果
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
