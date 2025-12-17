// ==========================================
// 图片处理工具 - TMDB图片URL处理和Base64转换
// ==========================================
import { TMDB } from './api';

type ImageSize = keyof typeof TMDB.posterSizes;

export function getImageUrl(path: string | null, size: ImageSize = '中', type: 'poster' | 'profile' = 'poster'): string {
  if (!path) {
    return type === 'poster' ? '/placeholder-poster.png' : '/placeholder-avatar.png';
  }
  
  // 确保path是完整的URL或正确的相对路径
  if (path.startsWith('http')) {
    // 如果已经是完整URL，直接使用代理
    return `/api/image-proxy?url=${encodeURIComponent(path)}`;
  } else if (!path.startsWith('/')) {
    // 如果是TMDB的相对路径但没有前导斜杠，添加斜杠
    path = '/' + path;
  }
  
  // 使用代理
  const tmdbImageUrl = `${TMDB.imageBaseUrl}/${TMDB.posterSizes[size]}${path}`;
  return `/api/image-proxy?url=${encodeURIComponent(tmdbImageUrl)}`;
}

export async function getBase64Image(input: string | File): Promise<string> {
  // 如果输入是 File 对象
  if (input instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(input);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }
  
  // 对于URL，考虑使用代理服务器
  const imageUrl = input.startsWith('http') 
    ? `/api/image-proxy?url=${encodeURIComponent(input)}`
    : input;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        
        // 使用最高质量进行转换
        const base64 = canvas.toDataURL('image/jpeg', 1.0);
        console.log('Base64 conversion successful');
        resolve(base64);
      } catch (error) {
        console.error('Error during base64 conversion:', error);
        reject(error);
      }
    };
    
    img.onerror = (error) => {
      console.error('Error loading image:', error);
      reject(new Error('Failed to load image'));
    };

    // 添加时间戳避免缓存
    img.src = `${imageUrl}?t=${Date.now()}`;
  });
}