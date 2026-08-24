"use client";

import type React from "react";
import { useEffect, useState } from "react";

interface ScaleLayoutProps {
  children: React.ReactNode;
}

/**
 * ScaleLayout - Fixed-proportion scaling viewport with dynamic background expansion
 *
 * Base design resolution: 1600x900
 * Keeps ALL buttons, fonts, seat sizes, and proportions 100% identical.
 * Dynamically expands the virtual width to match the screen aspect ratio,
 * eliminating left and right black bars while preserving exact UI scaling.
 */
export function ScaleLayout({ children }: ScaleLayoutProps) {
  const [scale, setScale] = useState(1);
  const [virtualWidth, setVirtualWidth] = useState(1600);
  const [virtualHeight, setVirtualHeight] = useState(900);
  const [mounted, setMounted] = useState(false);

  const BASE_WIDTH = 1600;
  const BASE_HEIGHT = 900;

  useEffect(() => {
    setMounted(true);

    const calculateScale = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate scale to fit vertical dimension (900px base)
      const scaleX = windowWidth / BASE_WIDTH;
      const scaleY = windowHeight / BASE_HEIGHT;

      // Use the smaller scale so nothing is cut off vertically or horizontally
      const newScale = Math.max(0.35, Math.min(scaleX, scaleY));
      setScale(newScale);

      // Virtual dimensions:
      // If screen is wider than 16:9, expand virtualWidth so the stage fills 100% of the screen width
      // without changing the scale factor or element sizes!
      const vWidth = Math.max(BASE_WIDTH, windowWidth / newScale);
      const vHeight = Math.max(BASE_HEIGHT, windowHeight / newScale);
      setVirtualWidth(vWidth);
      setVirtualHeight(vHeight);
    };

    calculateScale();

    window.addEventListener("resize", calculateScale);
    window.addEventListener("orientationchange", calculateScale);

    return () => {
      window.removeEventListener("resize", calculateScale);
      window.removeEventListener("orientationchange", calculateScale);
    };
  }, []);

  if (!mounted) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center">
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
    <div className="w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center">
      {/* The Stage - Dynamic width at exact scale factor */}
      <div
        style={{
          width: `${virtualWidth}px`,
          height: `${virtualHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
        className="relative overflow-hidden"
      >
        {children}
      </div>
    </div>
  );
}
