"use client";

import { useState, useEffect, ReactNode } from "react";

interface GameStageProps {
  children: ReactNode;
}

// 基准尺寸：18:9 (2:1) 长宽比
const BASE_WIDTH = 1536;
const BASE_HEIGHT = 768;

export default function GameStage({ children }: GameStageProps) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calculateScale = () => {
      // 计算公式：取宽高缩放比例的最小值，乘以 0.98 留一点安全边距
      const newScale = Math.min(
        window.innerWidth / BASE_WIDTH,
        window.innerHeight / BASE_HEIGHT
      ) * 0.98;
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
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
      <div
        className="relative origin-center bg-slate-900 shadow-2xl"
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
