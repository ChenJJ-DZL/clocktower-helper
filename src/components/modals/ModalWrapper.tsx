"use client";

import React from "react";

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
  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
      }}
    >
      {/* 点击遮罩关闭 */}
      {closeOnOverlayClick && (
        <div 
          className="absolute inset-0" 
          onClick={onClose}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      )}

      {/* 弹窗主体 */}
      <div
        className={`relative z-10 flex flex-col bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10 ${className}`}
        style={{
          width: 'min(90vw, 42rem)',
          maxWidth: '90vw',
          maxHeight: 'calc(90vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))', // 考虑iPhone安全区域
          margin: 'max(1rem, env(safe-area-inset-top)) auto max(1rem, env(safe-area-inset-bottom)) auto', // 上下安全区域
        }}
        onClick={(e) => e.stopPropagation()}
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
    </div>
  );
}

