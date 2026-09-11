"use client";

import { AutoFitContent } from "../common/AutoFitContent";
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
      onClose={onClose}
      footer={
        <div className="flex justify-center w-full">
          <button
            type="button"
            onClick={onClose}
            className="w-full max-w-md py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-lg sm:text-xl shadow-lg shadow-indigo-950/50 ring-2 ring-indigo-400 transition cursor-pointer active:scale-[0.98]"
          >
            知道了
          </button>
        </div>
      }
    >
      <AutoFitContent
        targetRatio={0.9}
        minScale={0.2}
        className="p-2 sm:p-4 text-white"
      >
        <p className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-100 whitespace-pre leading-relaxed text-center">
          {message}
        </p>
      </AutoFitContent>
    </ModalWrapper>
  );
}
