import { toPng } from 'html-to-image';
import { messages } from './constants/messages';

interface ExportOptions {
  quality?: number;
  backgroundColor?: string;
  pixelRatio?: number;
}

export async function exportToPng(
  elementId: string, 
  filename: string,
  options: ExportOptions = {}
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(messages.errors.exportFailed);
  }

  try {
    const dataUrl = await toPng(element, {
      quality: 0.95,
      backgroundColor: '#fff',
      pixelRatio: 2,
      ...options,
      filter: (node) => {
        // 排除导出按钮和返回按钮
        const excludeClasses = ['export-button', 'back-button'];
        return !excludeClasses.some(className => 
          node instanceof Element && node.classList.contains(className)
        );
      },
      cacheBust: true, // 避免缓存导致的图片加载问题
    });

    // 创建下载链接
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Export failed:', err);
    throw new Error(messages.errors.exportFailed);
  }
}