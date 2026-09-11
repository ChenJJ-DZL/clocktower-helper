"use client";

import { ModalWrapper } from "./ModalWrapper";

interface GenericConfirmModalProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GenericConfirmModal({
  title = "确认操作",
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
}: GenericConfirmModalProps) {
  return (
    <ModalWrapper
      title={title}
      widthRatio={0.98}
      maxWidthPx={1560}
      onClose={onCancel}
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 max-w-md py-6 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[34px] border border-slate-700 transition cursor-pointer active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 max-w-md py-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-[34px] shadow-lg shadow-indigo-950/50 ring-2 ring-indigo-400 transition cursor-pointer active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {/* 允许换行换更大字号：不再用 AutoFitContent 强压成单行。
          字号用固定设计像素而非 sm:/md: —— 本应用跑在 1600x900 缩放舞台里，
          媒体查询看的是真实视口宽度，用断点会导致不同设备上字号不一致。 */}
      <div className="flex flex-col flex-1 items-center justify-center text-center p-6 my-auto w-full">
        <p className="text-[52px] font-black text-slate-100 whitespace-pre-line leading-snug">
          {message}
        </p>
      </div>
    </ModalWrapper>
  );
}
