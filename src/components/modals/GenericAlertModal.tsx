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
    <ModalWrapper title={title} onClose={onClose}>
      <div className="p-6 text-white">
        <p className="text-center text-lg whitespace-pre-line leading-relaxed">
          {message}
        </p>
        <div className="flex justify-center mt-6">
          <button
            onClick={onClose}
            className="px-8 py-2.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition"
          >
            知道了
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
