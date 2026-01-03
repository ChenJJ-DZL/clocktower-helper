"use client";

import { useState, useEffect } from "react";

export default function PortraitLock() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspectRatio = width / height;
      
      // 仅在竖屏（宽高比 < 1）且宽度 < 1024px（移动端）时显示
      setShouldShow(aspectRatio < 1 && width < 1024);
    };

    // 初始检查
    checkOrientation();

    // 监听窗口大小变化和方向变化
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-8 text-center">
      {/* 手机旋转图标 SVG */}
      <div className="relative mb-8">
        <svg
          className="w-32 h-32 text-slate-300"
          fill="none"
          viewBox="0 0 120 120"
          stroke="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 竖屏手机 */}
          <rect
            x="40"
            y="20"
            width="40"
            height="80"
            rx="4"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
          {/* 横屏手机（旋转后） */}
          <g className="animate-rotate-device">
            <rect
              x="20"
              y="40"
              width="80"
              height="40"
              rx="4"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 屏幕 */}
            <rect
              x="28"
              y="48"
              width="64"
              height="24"
              rx="2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* 旋转箭头 */}
          <g className="animate-rotate-arrow">
            <path
              d="M 60 10 L 60 25 M 60 95 L 60 110 M 10 60 L 25 60 M 95 60 L 110 60"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M 25 25 L 10 10 M 95 95 L 110 110 M 25 95 L 10 110 M 95 25 L 110 10"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>

      {/* 文字提示 */}
      <h2 className="text-2xl md:text-3xl font-bold text-slate-200 mb-4">
        请将设备旋转至横屏以获得最佳体验
      </h2>
      
      <p className="text-lg md:text-xl text-slate-400">
        推荐使用 iPad 或平板电脑游玩
      </p>
    </div>
  );
}

