import { TMDB } from '../constants/api';

type ImageSize = keyof typeof TMDB.posterSizes;
type ImageType = 'poster' | 'profile' | 'backdrop';

export function getImageUrl(path: string | null, size: ImageSize, type: ImageType): string {
  if (!path) {
    return type === 'profile' ? '/placeholder-avatar.png' : '/placeholder-poster.png';
  }
  return `${TMDB.imageBaseUrl}/${TMDB.posterSizes[size]}${path}`;
}

export async function getBase64Image(imgUrl: string): Promise<string> {
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
    img.src = `${imgUrl}?t=${Date.now()}`;
  });
}
