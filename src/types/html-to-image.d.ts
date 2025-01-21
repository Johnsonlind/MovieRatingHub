import 'html-to-image';

declare module 'html-to-image' {
  export interface Options {
    quality?: number;
    pixelRatio?: number;
    skipAutoScale?: boolean;
    cacheBust?: boolean;
    onclone?: (clonedNode: HTMLElement) => void;
    filter?: (node: HTMLElement) => boolean;
  }

  export function toPng(element: HTMLElement, options?: Options): Promise<string>;
} 
