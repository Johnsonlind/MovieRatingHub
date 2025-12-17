// ==========================================
// Lenis 平滑滚动 Hook
// 提供类似 Letterboxd 的流畅滚动体验
// ==========================================
import { useEffect } from 'react';
import Lenis from 'lenis';

export function useLenis() {
  useEffect(() => {
    // 初始化 Lenis，配置类似 Letterboxd 的极致平滑滚动
    const lenis = new Lenis({
      duration: 1.2, // 使用默认持续时间，获得最平滑的效果
      easing: (t) => {
        // 使用 Lenis 默认的平滑缓动函数，这是最丝滑的
        // 这个函数提供了自然的减速效果，类似 Letterboxd
        return Math.min(1, 1.001 - Math.pow(2, -10 * t));
      },
      lerp: 0.08, // 使用更低的 lerp 值获得更丝滑的效果（默认值，最平滑）
      orientation: 'vertical', // 垂直滚动
      gestureOrientation: 'vertical',
      smoothWheel: true, // 启用平滑滚轮
      wheelMultiplier: 1.3, // 降低滚轮灵敏度，获得更平滑、更可控的感觉
      touchMultiplier: 1.5, // 触摸灵敏度
      infinite: false, // 不无限滚动
      syncTouch: false, // 移动端不同步触摸事件，使用原生滚动以获得更好的性能
      autoRaf: true, // 自动使用 requestAnimationFrame
    });

    // 将 Lenis 实例绑定到 window，方便调试
    (window as any).lenis = lenis;

    // 清理函数
    return () => {
      lenis.destroy();
    };
  }, []);
}
