"use client";

import { useEffect, useState } from "react";

interface PortraitLockProps {
  gamePhase?: string;
  onDismiss?: () => void;
}

/**
 * PortraitLock - 竖屏提示横屏使用的专用浮层
 * 当移动设备处于竖屏状态时提示：“请横屏使用”
 * 旋转回横屏后自动解除遮罩进入游戏
 */
export default function PortraitLock({
  gamePhase: _gamePhase,
  onDismiss,
}: PortraitLockProps) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // 竖屏判断：当前视口高度大于视口宽度
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
      if (!portrait) {
        // 一旦转入横屏，重置 dismissed 状态，使得后续重新转竖屏时仍能再次提示
        setDismissed(false);
      }
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  if (!isPortrait || dismissed) {
    return null;
  }

  return (
    <div
      data-testid="portrait-lock-overlay"
      className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center bg-slate-950/98 text-white select-none p-6 text-center animate-fadeIn"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9999999,
        backgroundColor: "rgb(2 6 23 / 98%)",
      }}
    >
      {/* 旋转设备图标动画 */}
      <div className="relative mb-8 flex items-center justify-center">
        <svg
          className="w-28 h-28 text-amber-400 drop-shadow-[0_0_24px_rgba(245,158,11,0.35)]"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 旋转手机图形 */}
          <g className="animate-rotate-device">
            <rect
              x="42"
              y="22"
              width="36"
              height="76"
              rx="8"
              stroke="currentColor"
              strokeWidth="3.5"
              fill="rgba(15, 23, 42, 0.9)"
            />
            {/* 听筒槽 */}
            <line
              x1="53"
              y1="28"
              x2="67"
              y2="28"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* 屏幕区域 */}
            <rect
              x="47"
              y="34"
              width="26"
              height="50"
              rx="3"
              fill="rgba(245, 158, 11, 0.15)"
            />
            {/* Home 键点 */}
            <circle cx="60" cy="91" r="2.5" fill="currentColor" />
          </g>

          {/* 旋转指示圆弧箭头 */}
          <g className="animate-rotate-arrow">
            <path
              d="M 28 60 A 32 32 0 0 1 92 60"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              strokeLinecap="round"
              fill="none"
              opacity="0.85"
            />
            <polygon
              points="94,54 99,63 89,63"
              fill="currentColor"
              transform="rotate(45 92 60)"
            />
          </g>
        </svg>
      </div>

      {/* 核心提示标题 */}
      <h1 className="text-3xl sm:text-4xl font-black text-amber-400 tracking-wider mb-3 drop-shadow-md">
        请横屏使用
      </h1>

      {/* 详细说明 */}
      <p className="text-base sm:text-lg font-bold text-slate-100 max-w-xs sm:max-w-md leading-relaxed mb-2">
        《血染钟楼说书人魔典》专为横屏桌面量身设计
      </p>
      <p className="text-xs sm:text-sm text-slate-400 max-w-xs sm:max-w-md leading-relaxed mb-8">
        请将手机旋转至横屏，系统将自动解锁并等比例完整展现所有内容。
      </p>

      {/* 状态徽章 */}
      <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-mono shadow-inner shadow-black/60">
        <span className="animate-spin text-sm">🔄</span>
        <span>等待旋转设备中…</span>
      </div>

      {/* 应急/测试旁路入口 */}
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          if (onDismiss) onDismiss();
        }}
        className="mt-10 text-xs text-slate-500 hover:text-slate-400 underline cursor-pointer transition active:scale-95"
        title="仅用于临时竖屏预览"
      >
        暂不旋转，仍以竖屏浏览
      </button>
    </div>
  );
}
