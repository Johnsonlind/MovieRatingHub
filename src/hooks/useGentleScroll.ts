import { useEffect, useRef, RefObject } from 'react';

type UseGentleScrollOptions = {
  enabled?: boolean;
  damping?: number;
  maxOffset?: number;
  stopEpsilon?: number;
  scrollContainer?: HTMLElement | null;
  scrollBurstThreshold?: number;
  scrollBurstWindow?: number;
  scrollBurstCooldown?: number;
  onAutoDisable?: () => void;
  contentSelector?: string;
  transformRef?: RefObject<HTMLElement | null>;
};

type UseGentleScrollReturn = {
  snapToCurrent: () => void;
  markProgrammaticScroll: () => void;
};

export function useGentleScroll(
  contentRef: RefObject<HTMLElement | null>,
  {
    enabled = true,
    damping = 0.22,
    maxOffset = 6,
    stopEpsilon = 0.35,
    scrollContainer = null,
    scrollBurstThreshold = 10,
    scrollBurstWindow = 100,
    scrollBurstCooldown = 300,
    onAutoDisable,
    contentSelector,
    transformRef,
  }: UseGentleScrollOptions = {},
): UseGentleScrollReturn {
  const targetY = useRef(0);
  const currentY = useRef(0);
  const rafId = useRef<number>();
  const lastFrame = useRef<number>(0);
  const frameDropStreak = useRef(0);
  const burstUntil = useRef(0);
  const scrollEvents = useRef<number[]>([]);
  const lastTransform = useRef<string>('translateY(0px)');
  const stableFrames = useRef(0);
  const contentTransformRef = useRef<HTMLElement | null>(null);
  const programmaticSnap = useRef(false);
  const lastTarget = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return;
    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReduced) return; // prefers-reduced-motion edge fix

    const scrollElement = scrollContainer ?? document.documentElement;
    if (!scrollElement) return;

    const useWindowScroll = scrollElement === document.documentElement || scrollElement === document.body;

    // 优化 contentEl 选择逻辑 + fallback
    const resolveTransformEl = (): HTMLElement | null => {
      if (transformRef?.current) return transformRef.current;
      if (contentRef.current) return contentRef.current;
      if (contentSelector && scrollElement instanceof HTMLElement) {
        const sel = scrollElement.querySelector(contentSelector) as HTMLElement | null;
        if (sel) return sel;
      }
      if (scrollElement instanceof HTMLElement && scrollElement.firstElementChild) {
        return scrollElement.firstElementChild as HTMLElement;
      }
      return null;
    };

    const contentEl = resolveTransformEl();
    if (!contentEl || !contentEl.isConnected) return;

    let disposed = false;
    contentTransformRef.current = contentEl;

    const getScrollTop = () => {
      if (useWindowScroll) {
        return window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      }
      return (scrollElement as HTMLElement).scrollTop;
    };

    const applyTransform = (offset: number) => {
      if (!contentEl.isConnected) return false; // 空节点保护
      const next = Math.abs(offset) < 0.01 ? 'translateY(0px)' : `translateY(${offset}px)`;
      if (next === lastTransform.current) return true;
      contentEl.style.transform = next;
      contentEl.style.willChange = Math.abs(offset) < 0.01 ? '' : 'transform';
      lastTransform.current = next;
      return true;
    };

    const stop = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = undefined;
      currentY.current = targetY.current = getScrollTop();
      applyTransform(0);
      stableFrames.current = 0;
      programmaticSnap.current = false;
    };

    const loop = () => {
      rafId.current = requestAnimationFrame((now) => {
        if (disposed) return;
        if (!contentEl.isConnected) {
          stop(); // 空节点保护
          return;
        }

        if (now < burstUntil.current) {
          rafId.current = undefined;
          applyTransform(0);
          return;
        }

        const dt = now - lastFrame.current;
        lastFrame.current = now;

        // dt 异常帧修正
        if (dt > 200) {
          frameDropStreak.current = 0;
          currentY.current = targetY.current;
          applyTransform(0);
          programmaticSnap.current = false;
        } else {
          frameDropStreak.current = dt > 32 ? frameDropStreak.current + 1 : 0;
        }

        if (frameDropStreak.current >= 3) {
          stop();
          onAutoDisable?.();
          return;
        }

        const diff = targetY.current - currentY.current;

        // 程序化 scrollTo / 锚点强制 snap
        if (programmaticSnap.current || Math.abs(diff) > maxOffset * 3) {
          programmaticSnap.current = false;
          currentY.current = targetY.current;
          applyTransform(0);
          rafId.current = undefined;
          return;
        }

        const clamped = Math.max(-maxOffset, Math.min(maxOffset, diff));
        currentY.current += clamped * damping;

        const delta = targetY.current - currentY.current;
        const shouldSnap = Math.abs(delta) < stopEpsilon;

        if (!applyTransform(currentY.current - targetY.current)) {
          stop();
          return;
        }

        // 停止立即 snap，消除短暂空白
        if (shouldSnap) {
          stableFrames.current += 1;
          if (stableFrames.current >= 1) {
            currentY.current = targetY.current;
            applyTransform(0);
            rafId.current = undefined;
            return;
          }
        } else {
          stableFrames.current = 0;
        }

        loop();
      });
    };

    const handleScroll = () => {
      if (disposed) return;
      const now = performance.now();
      targetY.current = getScrollTop();
      const deltaTarget = Math.abs(targetY.current - lastTarget.current);
      if (deltaTarget > maxOffset * 4) programmaticSnap.current = true; // 快速滚动瞬时 snap
      lastTarget.current = targetY.current;

      scrollEvents.current.push(now);
      while (scrollEvents.current.length && scrollEvents.current[0] < now - scrollBurstWindow) {
        scrollEvents.current.shift();
      }
      if (scrollEvents.current.length > scrollBurstThreshold) {
        burstUntil.current = now + scrollBurstCooldown;
        stop(); // 事件风暴降级
        onAutoDisable?.();
        return;
      }

      if (!rafId.current) {
        lastFrame.current = now;
        loop();
      }
    };

    // 初始化与监听
    targetY.current = getScrollTop();
    currentY.current = targetY.current;
    const scrollTarget: EventTarget = useWindowScroll ? window : scrollElement;
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', stop);

    return () => {
      disposed = true;
      scrollTarget.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', stop);
      stop(); // cleanup transform 残留
    };
  }, [
    enabled,
    damping,
    maxOffset,
    stopEpsilon,
    scrollContainer,
    scrollBurstThreshold,
    scrollBurstWindow,
    scrollBurstCooldown,
    onAutoDisable,
    contentSelector,
    contentRef,
    transformRef,
  ]);

  return {
    snapToCurrent: () => {
      targetY.current = currentY.current;
      lastTransform.current = 'translateY(0px)';
      const el = contentTransformRef.current;
      if (el && el.isConnected) {
        el.style.transform = 'translateY(0px)';
        el.style.willChange = '';
      }
    },
    markProgrammaticScroll: () => {
      programmaticSnap.current = true;
    },
  };
}