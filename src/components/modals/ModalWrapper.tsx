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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* 点击遮罩关闭 */}
      {closeOnOverlayClick && (
        <div className="absolute inset-0" onClick={onClose} />
      )}

      {/* 弹窗主体 */}
      <div
        className={`relative z-10 w-[90%] max-w-2xl max-h-[90%] flex flex-col bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10 ${className}`}
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
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {children}
        </div>

        {/* 3. 底部按钮区 (固定) */}
        {footer && (
          <div className="p-4 border-t border-white/10 bg-slate-950/50 shrink-0 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

