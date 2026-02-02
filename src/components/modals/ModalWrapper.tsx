"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

  useEffect(() => {
    setMounted(true);
    console.log('[ModalWrapper] Mounted, title:', title);
    // ... (rest of logging)
    // Verify portal target exists
    if (document.body) {
      console.log('[ModalWrapper] ✅ Portal target (document.body) is available');
    } else {
      console.error('[ModalWrapper] ❌ Portal target (document.body) is NOT available!');
    }
  }, [title]);


  if (typeof document === "undefined" || !mounted) {
    console.log('[ModalWrapper] Not mounted yet or no document');
    return null;
  }

  console.log('[ModalWrapper] Rendering portal for:', title);
  console.log('[ModalWrapper] document.body exists:', !!document.body);

  if (!document.body) {
    console.error('[ModalWrapper] document.body is not available!');
    return null;
  }

  // Use ref to ensure key remains stable across renders
  const portalKey = portalKeyRef.current;

  if (mounted && document.body) {
    // Only log occasionally or on mount to reduce noise
    // console.log('[ModalWrapper] Portal key:', portalKey);
  }

  return createPortal(
    <div
      data-modal-key={portalKey}
      className="fixed inset-0 flex items-center justify-center bg-black/50 pointer-events-auto"
      style={{
        zIndex: 2147483647,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        opacity: 1,
        visibility: 'visible',
      } as React.CSSProperties}
      onClick={(e) => {
        // 只有点击遮罩层本身时才关闭，点击弹窗内容时不关闭
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          console.log('[ModalWrapper] Overlay clicked, closing modal');
          onClose();
        }
      }}
    >
      {/* 弹窗主体 */}
      <div
        className={`relative z-10 flex flex-col bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10 pointer-events-auto ${className}`}
        style={{
          width: 'min(90vw, 42rem)',
          maxWidth: '90vw',
          maxHeight: 'calc(90vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          margin: 'max(1rem, env(safe-area-inset-top)) auto max(1rem, env(safe-area-inset-bottom)) auto',
          zIndex: 2147483647,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgb(15 23 42)', // slate-900
          borderRadius: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          opacity: 1,
          visibility: 'visible',
        }}
        onClick={(e) => {
          e.stopPropagation();
          console.log('[ModalWrapper] Modal content clicked');
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
          className="flex-1 overflow-y-auto p-6 space-y-4"
          style={{
            maxHeight: 'calc(90vh - 8rem)', // 减去标题栏和底部按钮的高度
            WebkitOverflowScrolling: 'touch', // iOS平滑滚动
          }}
        >
          {children}
        </div>

        {/* 3. 底部按钮区 (固定) */}
        {footer && (
          <div
            className="p-4 border-t border-white/10 bg-slate-950/50 shrink-0 flex flex-wrap justify-end gap-3"
            style={{
              minHeight: '4rem', // 确保按钮区域有足够高度
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', // iPhone底部安全区域
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

