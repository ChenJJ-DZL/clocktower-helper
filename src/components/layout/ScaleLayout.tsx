"use client";

import type React from "react";
import { useEffect, useState } from "react";

interface ScaleLayoutProps {
  children: React.ReactNode;
}

/**
 * ScaleLayout - 严格等比例还原 PC 端（1600x900）完整体验的缩放容器
 *
 * 基准设计分辨率：1600x900（包含魔典圆桌、15座圆形阵列、右侧控制台及所有交互弹窗）
 * 在任何屏幕（PC、平板、手机横屏）上：
 * 通过 transform: scale(min(w/1600, h/900)) 严格等比缩放并全屏居中呈现。
 * 在宽屏手机（如 iPhone 17 等 19.5:9 比例）上，左右自然留出对称安全区域，
 * 物理杜绝灵动岛、刘海以及屏幕大圆角对任何游戏元素、按钮或文字的遮挡。
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

      // 计算双向缩放比例
      const scaleX = windowWidth / BASE_WIDTH;
      const scaleY = windowHeight / BASE_HEIGHT;

      // 取两者较小值，确保无论横纵方向内容 100% 完整显示、绝不被裁切
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
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
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center overflow-hidden select-none">
        <div
          style={{
            width: `${BASE_WIDTH}px`,
            height: `${BASE_HEIGHT}px`,
          }}
          className="bg-slate-950 relative overflow-hidden flex-shrink-0"
        >
          {children}
          <div
            id="scale-layout-modal-root"
            className="absolute inset-0 pointer-events-none z-[999999]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center select-none">
      {/* 1600x900 严格等比 PC 虚拟舞台 */}
      <div
        id="scale-layout-stage"
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
        className="relative overflow-hidden bg-slate-950 shadow-2xl"
      >
        {children}
        {/* 缩放舞台内的弹窗根节点 */}
        <div
          id="scale-layout-modal-root"
          className="absolute inset-0 pointer-events-none z-[999999]"
        />
      </div>
    </div>
  );
}
