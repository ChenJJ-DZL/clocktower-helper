"use client";

import { useState, useEffect, ReactNode } from "react";

interface GameStageProps {
  children: ReactNode;
}

// 基准尺寸：2:1 长宽比
const BASE_WIDTH = 1600;
const BASE_HEIGHT = 800;

export default function GameStage({ children }: GameStageProps) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calculateScale = () => {
      // 计算宽和高的缩放比例
      const scaleX = window.innerWidth / BASE_WIDTH;
      const scaleY = window.innerHeight / BASE_HEIGHT;
      // 关键点：取两者中较小的一个，保证绝不溢出
      const newScale = Math.min(scaleX, scaleY);
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
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div
        className="relative origin-center bg-slate-900 shadow-2xl border-4 border-green-500"
        style={{
          width: "1600px",
          height: "800px",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
