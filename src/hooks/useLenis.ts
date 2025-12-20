// ==========================================
// Lenis 平滑滚动 Hook
// ==========================================
import { useEffect } from 'react';
import Lenis from 'lenis';

export function useLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => {
        return Math.min(1, 1.001 - Math.pow(2, -10 * t));
      },
      lerp: 0.08,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.3,
      touchMultiplier: 1.5,
      infinite: false,
      syncTouch: false,
      autoRaf: true,
    });

    (window as any).lenis = lenis;

    return () => {
      lenis.destroy();
    };
  }, []);
}
