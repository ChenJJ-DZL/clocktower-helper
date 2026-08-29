"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FadeIn, SlideUp } from "../common/AnimationWrapper";

export interface ModalWrapperProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnOverlayClick?: boolean;
  /** 自定义容器类名 */
  className?: string;
  /** 弹窗尺寸模式: 'default' | 'fullscreen90' (全屏 90% 宽 * 90% 高等比放大) */
  size?: "default" | "fullscreen90";
}

export function ModalWrapper({
  title,
  children,
  footer,
  onClose,
  closeOnOverlayClick = true,
  className = "",
  size: _size = "fullscreen90",
}: ModalWrapperProps) {
  // CRITICAL: Use ref to ensure key remains stable across renders
  const portalKeyRef = React.useRef(
    `modal-${typeof title === "string" ? title : "custom"}-${Date.now()}`
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (typeof document === "undefined" || !mounted) {
    return null;
  }

  if (!document.body) {
    console.error("[ModalWrapper] document.body is not available!");
    return null;
  }

  // Use ref to ensure key remains stable across renders
  const portalKey = portalKeyRef.current;

  return createPortal(
    <div
      role="dialog"
      data-modal-key={portalKey}
      className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
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
          backgroundColor: "rgba(0, 0, 0, 0.8)",
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
      <FadeIn
        duration={0.2}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      >
        <div />
      </FadeIn>

      {/* 弹窗主体：统一至少 90% 宽高，适配大屏与移动端 */}
      <SlideUp
        duration={0.3}
        className="relative z-10 w-full flex justify-center items-center h-full max-h-screen p-2 sm:p-4"
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`relative z-10 flex flex-col bg-slate-900 rounded-2xl sm:rounded-3xl border-2 border-white/20 shadow-2xl overflow-hidden pointer-events-auto w-[94vw] max-w-7xl h-[90vh] max-h-[92vh] ${className}`}
          style={{
            width: "min(94vw, 84rem)",
            height: "90vh",
            maxWidth: "94vw",
            maxHeight: "92vh",
            margin: "auto",
            zIndex: 2147483647,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "rgb(15 23 42)", // slate-900
            borderRadius: "1.5rem",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
            opacity: 1,
            visibility: "visible",
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {/* 1. 标题栏：文字与按钮同步放大 */}
          <div className="flex items-center justify-between px-4 py-3.5 sm:px-8 sm:py-5 border-b border-white/10 shrink-0 bg-slate-900">
            <div className="flex-1 min-w-0">
              {typeof title === "string" ? (
                <h2 className="font-black text-white text-xl sm:text-3xl md:text-4xl truncate">
                  {title}
                </h2>
              ) : (
                title
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 sm:p-3 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white shrink-0 text-2xl sm:text-3xl cursor-pointer active:scale-90 ml-3"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          {/* 2. 内容区：弹性伸缩，支持 iOS 平滑触控滚动，默认上下垂直居中 */}
          <div
            className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 md:p-10 flex flex-col text-lg sm:text-xl md:text-2xl text-slate-100"
            style={{
              WebkitOverflowScrolling: "touch", // iOS平滑滚动
            }}
          >
            <div className="flex-1 min-h-full flex flex-col justify-center my-auto w-full">
              {children}
            </div>
          </div>

          {/* 3. 底部操作栏 (固定在底部，按钮大而清晰) */}
          {footer && (
            <div
              className="px-4 py-3 sm:px-6 sm:py-4 border-t border-white/10 bg-slate-950/80 shrink-0 flex flex-wrap justify-end gap-3 sm:gap-4 items-center min-h-[3.75rem] sm:min-h-[4.5rem]"
              style={{
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
