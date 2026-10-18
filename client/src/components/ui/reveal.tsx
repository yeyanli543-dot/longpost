import React, { useEffect, useRef, useState } from 'react';

/**
 * 滚动揭示动画（Scroll Reveal）
 *
 * 现在各大产品官网的标配：元素进入视口时轻微上浮 + 淡入。
 * 只动 opacity 与 transform，不触发重排，所以不会拖慢长文页面。
 *
 * 三个刻意的取舍：
 * 1. **一次性**：划过就定住，来回滚动不会反复播 —— 反复播是"炫技感"的主要来源；
 * 2. **尊重系统设置**：prefers-reduced-motion 时直接显示，连观察器都不注册；
 * 3. **无 JS 也能看**：初始态在 useEffect 里才设，SSR / 加载失败时内容仍是可见的。
 */

export interface RevealProps {
  children: React.ReactNode;
  /** 延迟毫秒，用于列表错峰 */
  delay?: number;
  /** 初始下移距离（px） */
  y?: number;
  /** 动效时长（ms） */
  duration?: number;
  className?: string;
  /** 视口判定偏移，提前/延后触发 */
  rootMargin?: string;
}

export function Reveal({
  children,
  delay = 0,
  y = 18,
  duration = 520,
  className = '',
  rootMargin = '0px 0px -8% 0px',
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  /** 只有确认要动效时才加过渡，避免「先渲染再跳」 */
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    setAnimate(true);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin, threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translate3d(0, ${y}px, 0)`,
        transition: animate
          ? `opacity ${duration}ms cubic-bezier(.2,.8,.2,1) ${delay}ms, transform ${duration}ms cubic-bezier(.2,.8,.2,1) ${delay}ms`
          : undefined,
        willChange: shown ? undefined : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}

export default Reveal;
