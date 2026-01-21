"use client";

import React, { useEffect, useState } from "react";

interface ScaleLayoutProps {
  children: React.ReactNode;
}

/**
 * ScaleLayout - Fixed-resolution scaling viewport
 * 
 * Base resolution: 1600x900 (16:9 aspect ratio)
 * Scales content to fit any viewport while maintaining aspect ratio
 */
export function ScaleLayout({ children }: ScaleLayoutProps) {
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);

  const BASE_WIDTH = 1600;
  const BASE_HEIGHT = 900;

  useEffect(() => {
    setMounted(true);

    const calculateScale = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate scale to fit both dimensions
      const scaleX = windowWidth / BASE_WIDTH;
      const scaleY = windowHeight / BASE_HEIGHT;

      // Use the smaller scale to ensure content fits entirely
      const newScale = Math.min(scaleX, scaleY); // 移除最大缩放限制，允许内容放大以铺满屏幕

      setScale(newScale);
    };

    // Calculate initial scale
    calculateScale();

    // Listen for window resize
    window.addEventListener("resize", calculateScale);
    window.addEventListener("orientationchange", calculateScale);

    // Cleanup
    return () => {
      window.removeEventListener("resize", calculateScale);
      window.removeEventListener("orientationchange", calculateScale);
    };
  }, []);

  // Prevent flash of unstyled content
  if (!mounted) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div
          style={{
            width: `${BASE_WIDTH}px`,
            height: `${BASE_HEIGHT}px`,
          }}
          className="bg-slate-950"
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* The "Stage" - Fixed resolution content */}
      <div
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}

