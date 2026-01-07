"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

interface ScaleToFitProps {
  children: ReactNode;
  baseWidth?: number;
  baseHeight?: number;
  padding?: number;
}

/**
 * ScaleToFit - Wraps content and scales it to fit within the container
 * Uses ResizeObserver to detect container size changes and calculates scale
 */
export function ScaleToFit({ 
  children, 
  baseWidth = 800, 
  baseHeight = 800,
  padding = 32 
}: ScaleToFitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const updateScale = () => {
      const containerWidth = container.clientWidth - padding * 2;
      const containerHeight = container.clientHeight - padding * 2;
      
      const scaleX = containerWidth / baseWidth;
      const scaleY = containerHeight / baseHeight;
      
      // Use the smaller scale to ensure content fits in both dimensions
      const newScale = Math.min(scaleX, scaleY, 1); // Cap at 1 to prevent upscaling
      setScale(newScale);
    };

    // Initial calculation
    updateScale();

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    resizeObserver.observe(container);

    // Also listen to window resize as fallback
    window.addEventListener("resize", updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [baseWidth, baseHeight, padding]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <div
        ref={contentRef}
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}

