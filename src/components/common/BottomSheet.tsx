"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom Sheet 抽屉组件（移动端弹窗替代方案）
 *
 * 在屏幕宽度 ≤ 768px 时，将弹窗替换为贴底抽屉：
 * - 平滑上下滑动展开/关闭
 * - 遮罩点击关闭
 * - 拖拽手柄
 * - 不遮挡顶部对局信息
 */

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 最大高度占比（默认 85%） */
  maxHeightPercent?: number;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeightPercent = 85,
}: BottomSheetProps) {
  const [isMobile, setIsMobile] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const draggingRef = useRef(false);

  // 检测是否为移动设备
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 拖拽手势
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    draggingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;
    // 只允许向下拖拽
    if (diff > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${diff}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const diff = currentYRef.current - startYRef.current;
    // 拖拽超过 100px 关闭
    if (diff > 100) {
      onClose();
    }
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
  }, [onClose]);

  if (!isOpen || !isMobile) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity" />

      {/* 抽屉主体 */}
      <div
        ref={sheetRef}
        className="relative w-full bg-slate-900 rounded-t-2xl shadow-2xl border-t border-white/10 flex flex-col"
        style={{
          maxHeight: `${maxHeightPercent}vh`,
          transition: "transform 0.3s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 拖拽手柄 */}
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
