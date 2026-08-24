"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FadeIn, SlideUp } from "../common/AnimationWrapper";
import { BottomSheet } from "../common/BottomSheet";

export interface ModalWrapperProps {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnOverlayClick?: boolean;
  /** 自定义容器类名 */
  className?: string;
}

export function ModalWrapper({
  title,
  children,
  footer,
  onClose,
  closeOnOverlayClick = true,
  className = "",
}: ModalWrapperProps) {
  // CRITICAL: Use ref to ensure key remains stable across renders
  // MOVED TO TOP to avoid "Rendered more hooks" error if early return happens
  const portalKeyRef = React.useRef(`modal-${title}-${Date.now()}`);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const hasLoggedRef = React.useRef(false);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (typeof document === "undefined" || !mounted) {
    return null;
  }

  if (!document.body) {
    console.error("[ModalWrapper] document.body is not available!");
    return null;
  }

  // 🔧 移动端自动使用 Bottom Sheet 抽屉
  if (isMobile) {
    return (
      <BottomSheet isOpen={true} onClose={onClose} title={title}>
        {children}
        {footer && (
          <div className="mt-4 pt-3 border-t border-white/10 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </BottomSheet>
    );
  }

  // Use ref to ensure key remains stable across renders
  const portalKey = portalKeyRef.current;

  return createPortal(
    <div
      role="dialog"
      data-modal-key={portalKey}
      className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-auto"
      style={
        {
          zIndex: 2147483647,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          opacity: 1,
          visibility: "visible",
        } as React.CSSProperties
      }
      onClick={(e) => {
        // 只有点击遮罩层本身时才关闭，点击弹窗内容时不关闭
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <FadeIn duration={0.2} className="absolute inset-0 bg-black/75 backdrop-blur-sm">
        <div />
      </FadeIn>

      {/* 弹窗主体 */}
      <SlideUp
        duration={0.3}
        className="relative z-10 w-full flex justify-center"
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`relative z-10 flex flex-col bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10 pointer-events-auto ${className}`}
          style={{
            width:
              className?.includes("max-w-") || className?.includes("w-")
                ? "100%"
                : "min(90vw, 42rem)",
            maxWidth:
              className?.includes("max-w-7xl") || className?.includes("w-[98vw]") || className?.includes("w-[96vw]")
                ? "min(98vw, 92rem)"
                : className?.includes("max-w-6xl")
                  ? "min(96vw, 76rem)"
                  : className?.includes("max-w-5xl")
                    ? "min(96vw, 68rem)"
                    : className?.includes("max-w-4xl")
                      ? "min(92vw, 56rem)"
                      : className?.includes("max-w-3xl")
                        ? "min(90vw, 48rem)"
                        : "min(90vw, 42rem)",
            maxHeight:
              "calc(96vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
            margin:
              "max(0.5rem, env(safe-area-inset-top)) auto max(0.5rem, env(safe-area-inset-bottom)) auto",
            zIndex: 2147483647,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "rgb(15 23 42)", // slate-900
            borderRadius: "1rem",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            opacity: 1,
            visibility: "visible",
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {/* 1. 标题栏 */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0 bg-slate-900">
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          {/* 2. 内容区 (可滚动) */}
          <div
            className={`flex-1 overflow-y-auto ${
              className?.includes("p-0")
                ? "p-2 sm:p-3"
                : className?.includes("p-2")
                  ? "p-2 sm:p-3"
                  : className?.includes("p-4")
                    ? "p-3 sm:p-4"
                    : "p-4 sm:p-6"
            } space-y-4`}
            style={{
              maxHeight: "calc(94vh - 6.5rem)", // 减去标题栏和底部按钮的高度
              WebkitOverflowScrolling: "touch", // iOS平滑滚动
            }}
          >
            {children}
          </div>

          {/* 3. 底部按钮区 (固定) */}
          {footer && (
            <div
              className="px-4 py-3 border-t border-white/10 bg-slate-950/70 shrink-0 flex flex-wrap justify-end gap-3"
              style={{
                minHeight: "3.5rem", // 确保按钮区域有足够高度且不冗余
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))", // iPhone底部安全区域
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </SlideUp>
    </div>,
    document.body
  );
}
