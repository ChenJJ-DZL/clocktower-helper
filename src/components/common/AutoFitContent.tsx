"use client";

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface AutoFitContentProps {
  children: React.ReactNode;
  /** 目标容器宽高占比（默认 0.85 即 85%） */
  targetRatio?: number;
  className?: string;
  minScale?: number;
  maxScale?: number;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function AutoFitContent({
  children,
  targetRatio = 0.88,
  className = "",
  minScale = 0.5,
  maxScale = 5.0,
}: AutoFitContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const updateScale = () => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      if (containerW === 0 || containerH === 0) return;

      // 临时重置变换以准确测量内容原始宽高
      const originalTransform = content.style.transform;
      content.style.transform = "none";
      const contentW = content.scrollWidth || content.offsetWidth;
      const contentH = content.scrollHeight || content.offsetHeight;
      content.style.transform = originalTransform;

      if (contentW === 0 || contentH === 0) return;

      const targetW = containerW * targetRatio;
      const targetH = containerH * targetRatio;

      const scaleX = targetW / contentW;
      const scaleY = targetH / contentH;
      const calculatedScale = Math.min(scaleX, scaleY);
      const clampedScale = Math.max(
        minScale,
        Math.min(maxScale, calculatedScale)
      );

      setScale(clampedScale);
    };

    updateScale();

    // 多次确保：DOM 渲染后延迟 30ms、100ms 再次矫正
    const timer1 = setTimeout(updateScale, 30);
    const timer2 = setTimeout(updateScale, 100);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateScale();
      });
      if (containerRef.current) ro.observe(containerRef.current);
      if (contentRef.current) ro.observe(contentRef.current);
    }

    window.addEventListener("resize", updateScale);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      ro?.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [targetRatio, minScale, maxScale, children]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex items-center justify-center overflow-hidden flex-1 my-auto ${className}`}
      style={{
        minHeight: "100%",
        width: "100%",
        position: "relative",
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
          transition: "transform 0.1s ease-out",
          width: "max-content",
          maxWidth: "max-content",
        }}
        className="inline-flex flex-col items-center justify-center text-center shrink-0"
      >
        {children}
      </div>
    </div>
  );
}
