"use client";

import { useEffect, useState } from "react";

interface PortraitLockProps {
  gamePhase?: string;
  onDismiss?: () => void;
}

export default function PortraitLock({
  gamePhase,
  onDismiss,
}: PortraitLockProps) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspectRatio = width / height;

      // 仅在竖屏（宽高比 < 1）且宽度 < 1024px（移动端）时判定为竖屏
      setIsPortrait(aspectRatio < 1 && width < 1024);
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

  // 重置忽略状态（如切换阶段或转回横屏后再次竖屏）
  useEffect(() => {
    if (!isPortrait) {
      setDismissed(false);
    }
  }, [isPortrait]);

  // 1. 剧本选择页（scriptSelection）完全支持竖屏正常点选，不阻断说书人选本！
  if (gamePhase === "scriptSelection") return null;

  // 2. 如果不是竖屏或已被用户手动忽略，不显示提示
  if (!isPortrait || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
      style={{
        width: "100vw",
        height: "100vh",
        top: 0,
        left: 0,
      }}
    >
      {/* 手机旋转图标 SVG */}
      <div className="relative mb-6">
        <svg
          className="w-24 h-24 text-purple-400"
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
            opacity="0.4"
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
      <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">
        请旋转设备至横屏以进入魔典圆桌
      </h2>

      <p className="text-sm text-slate-400 mb-8 max-w-xs">
        说书人魔典圆桌与控制台专为横屏设计；如传感器锁定，亦可点击下方按钮继续
      </p>

      {/* 允许用户在特殊情况下继续竖屏游玩，杜绝死锁 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className="px-5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition active:scale-95"
        >
          忽略提示，继续在竖屏下使用
        </button>
      </div>
    </div>
  );
}
