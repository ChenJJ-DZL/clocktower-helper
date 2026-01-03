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
      // 使用 visualViewport 或 window 的尺寸（移动设备上更准确）
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      
      // 计算宽和高的缩放比例
      const scaleX = viewportWidth / BASE_WIDTH;
      const scaleY = viewportHeight / BASE_HEIGHT;
      // 关键点：取两者中较小的一个，保证绝不溢出，严格保持2:1比例
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
    };

    // 初始计算（延迟一帧确保viewport已正确初始化）
    const timer = setTimeout(calculateScale, 0);
    calculateScale();

    // 监听窗口大小变化
    window.addEventListener("resize", calculateScale);
    window.addEventListener("orientationchange", calculateScale);
    // 移动设备上使用 visualViewport 更准确
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", calculateScale);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calculateScale);
      window.removeEventListener("orientationchange", calculateScale);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", calculateScale);
      }
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        className="relative origin-center bg-slate-900 shadow-2xl"
        style={{
          width: "1600px",
          height: "800px",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
