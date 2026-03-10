// ==========================================
// 图片 API 处理工具
// ==========================================
import { TMDB } from './api';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

type ImageSize = keyof typeof TMDB.posterSizes;

export function getImageUrl(path: string | null, size: ImageSize = '中', type: 'poster' | 'profile' = 'poster'): string {
  if (!path) {
    return type === 'poster' ? '/placeholder-poster.png' : '/placeholder-avatar.png';
  }
  if (path.startsWith('http')) {
    if (path.includes('image.tmdb.org')) return path;
    return `/api/image-proxy?url=${encodeURIComponent(path)}`;
  }
  if (!path.startsWith('/')) path = '/' + path;
  return `${TMDB_IMAGE_BASE}/${TMDB.posterSizes[size]}${path}`;
}

export async function getBase64Image(input: string | File): Promise<string> {
  if (input instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(input);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }
  
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
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const base64 = canvas.toDataURL('image/png');
        console.log('Base64 conversion successful (PNG format)');
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

    img.src = `${imageUrl}?t=${Date.now()}`;
  });
}
