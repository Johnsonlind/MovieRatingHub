import { toPng } from 'html-to-image';
import { messages } from '../constants/messages';

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
    throw new Error(`Element with id "${elementId}" not found`);
  }

  try {
    // Wait for images to load
    const images = Array.from(element.getElementsByTagName('img'));
    await Promise.all(
      images.map(img => 
        new Promise<void>((resolve, reject) => {
          if (img.complete) {
            resolve();
            return;
          }

          const newImg = new Image();
          newImg.crossOrigin = 'anonymous';
          
          newImg.onload = () => resolve();
          newImg.onerror = () => {
            console.warn(`Failed to load image: ${img.src}`);
            resolve(); // Resolve anyway to continue with export
          };
          
          newImg.src = img.src;
        })
      )
    );

    // Add a small delay to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    const dataUrl = await toPng(element, {
      quality: options.quality ?? 0.95,
      backgroundColor: options.backgroundColor ?? '#fff',
      pixelRatio: options.pixelRatio ?? 2,
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        return !node.classList.contains('export-button') && 
               !node.classList.contains('back-button');
      },
      cacheBust: true
    });

    // Create and trigger download
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Export failed:', err);
    throw new Error(messages.errors.exportFailed);
  }
}