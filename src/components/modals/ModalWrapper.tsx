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
  /**
   * 弹窗宽度上限(设计像素，舞台坐标系)，默认 1360。
   * 舞台固定为 1600 设计宽并按比例缩放；纯文案类弹窗可连同 widthRatio 一起调高，
   * 以用满舞台宽度、获得更大正文字号。
   */
  maxWidthPx?: number;
  /** 弹窗占可用宽度的比例，默认 0.92。 */
  widthRatio?: number;
}

export function ModalWrapper({
  title,
  children,
  footer,
  onClose,
  closeOnOverlayClick = true,
  className = "",
  size: _size = "fullscreen90",
  maxWidthPx = 1360,
  widthRatio = 0.92,
}: ModalWrapperProps) {
  // CRITICAL: Use ref to ensure key remains stable across renders
  const portalKeyRef = React.useRef(
    `modal-${typeof title === "string" ? title : "custom"}-${Date.now()}`
  );
  const [mounted, setMounted] = useState(false);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const root =
      document.getElementById("scale-layout-modal-root") || document.body;
    setPortalNode(root);
  }, []);

  const activePortalNode =
    portalNode && document.body.contains(portalNode)
      ? portalNode
      : typeof document !== "undefined"
      ? document.getElementById("scale-layout-modal-root") || document.body
      : null;

  if (typeof document === "undefined" || !mounted || !activePortalNode) {
    return null;
  }

  // Use ref to ensure key remains stable across renders
  const portalKey = portalKeyRef.current;
  const isInsideScaleStage = activePortalNode.id === "scale-layout-modal-root";

  // 清理子组件可能传入的破坏性绝对视口 vw/vh 类名，确保由 scaled stage 统一等比支配
  const sanitizedClassName = className
    .replace(/\b[wh]-\[[^\]]+\]/g, "")
    .replace(/\bmax-[wh]-\[[^\]]+\]/g, "")
    .trim();

  return createPortal(
    <div
      role="dialog"
      data-modal-key={portalKey}
      className={`${
        isInsideScaleStage ? "absolute inset-0" : "fixed inset-0"
      } flex items-center justify-center bg-black/85 pointer-events-auto z-[999999]`}
      style={{
        position: isInsideScaleStage ? "absolute" : "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: 999999,
      }}
      onClick={(e) => {
        // 只有点击遮罩层本身时才关闭，点击弹窗内容时不关闭
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <FadeIn duration={0.2} className="absolute inset-0 bg-black/80">
        <div />
      </FadeIn>

      {/* 弹窗主体：统一等比适配 scaled stage */}
      <SlideUp
        duration={0.3}
        className="relative z-10 w-full flex justify-center items-center h-full p-4 sm:p-6 pointer-events-none"
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`relative z-10 flex flex-col bg-slate-900 rounded-2xl border-2 border-white/20 shadow-2xl overflow-hidden pointer-events-auto ${sanitizedClassName}`}
          style={{
            width: `min(${widthRatio * 100}%, ${maxWidthPx}px)`,
            height: "min(88%, 800px)",
            maxWidth: `${widthRatio * 100}%`,
            maxHeight: "88%",
            margin: "auto",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "rgb(15 23 42)", // slate-900
            borderRadius: "1.25rem",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
            opacity: 1,
            visibility: "visible",
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {/* 1. 标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 bg-slate-900">
            <div className="flex-1 min-w-0">
              {typeof title === "string" ? (
                <h2 className="font-black text-white text-2xl truncate">
                  {title}
                </h2>
              ) : (
                title
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white shrink-0 text-2xl cursor-pointer active:scale-90 ml-3"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          {/* 2. 内容区：弹性伸缩，支持平滑触控滚动 */}
          <div
            className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col text-slate-100"
            style={{
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div className="flex-1 min-h-0 flex flex-col w-full">
              {children}
            </div>
          </div>

          {/* 3. 底部操作栏 */}
          {footer && (
            <div className="px-6 py-3.5 border-t border-white/10 bg-slate-950/80 shrink-0 flex flex-wrap justify-end gap-3 items-center min-h-[3.75rem]">
              {footer}
            </div>
          )}
        </div>
      </SlideUp>
    </div>,
    activePortalNode
  );
}
