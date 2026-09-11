"use client";

import { ModalWrapper } from "./ModalWrapper";

interface GenericAlertModalProps {
  title?: string;
  message: string;
  onClose: () => void;
}

export function GenericAlertModal({
  title = "提示",
  message,
  onClose,
}: GenericAlertModalProps) {
  return (
    <ModalWrapper
      title={title}
      widthRatio={0.98}
      maxWidthPx={1560}
      onClose={onClose}
      footer={
        <div className="flex justify-center w-full">
          <button
            type="button"
            onClick={onClose}
            className="w-full max-w-lg py-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-[34px] shadow-lg shadow-indigo-950/50 ring-2 ring-indigo-400 transition cursor-pointer active:scale-[0.98]"
          >
            知道了
          </button>
        </div>
      }
    >
      {/* 允许换行换更大字号（同 GenericConfirmModal，字号用固定设计像素） */}
      <div className="flex flex-col flex-1 items-center justify-center text-center p-6 my-auto w-full">
        <p className="text-[52px] font-black text-slate-100 whitespace-pre-line leading-snug">
          {message}
        </p>
      </div>
    </ModalWrapper>
  );
}
