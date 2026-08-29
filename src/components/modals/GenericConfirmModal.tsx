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
      onClose={onCancel}
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 max-w-xs py-3.5 sm:py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-lg sm:text-xl border border-slate-700 transition cursor-pointer active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 max-w-xs py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-lg sm:text-xl shadow-lg shadow-indigo-950/50 ring-2 ring-indigo-400 transition cursor-pointer active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 items-center justify-center text-center p-6 my-auto w-full">
        <p className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-100 whitespace-pre-line leading-relaxed max-w-3xl">
          {message}
        </p>
      </div>
    </ModalWrapper>
  );
}
