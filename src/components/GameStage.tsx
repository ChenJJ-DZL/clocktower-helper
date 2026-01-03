"use client";

import { useState, useEffect, ReactNode } from "react";

interface GameStageProps {
  children: ReactNode;
}

export default function GameStage({ children }: GameStageProps) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calculateScale = () => {
      const baseWidth = 1536;
      const baseHeight = 768;
      const scaleX = window.innerWidth / baseWidth;
      const scaleY = window.innerHeight / baseHeight;
      // 乘以 0.9 留出更多安全边距，避免圆桌溢出屏幕
      const newScale = Math.min(scaleX, scaleY) * 0.9;
      setScale(newScale);
    };

    // 初始计算
    calculateScale();

    // 监听窗口大小变化
    window.addEventListener("resize", calculateScale);
    window.addEventListener("orientationchange", calculateScale);

    return () => {
      window.removeEventListener("resize", calculateScale);
      window.removeEventListener("orientationchange", calculateScale);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center">
      <div
        className="relative origin-center bg-slate-900 shadow-2xl"
        style={{
          width: "1536px",
          height: "768px",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
