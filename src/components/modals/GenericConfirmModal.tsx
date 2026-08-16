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
  title = "确认",
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
}: GenericConfirmModalProps) {
  return (
    <ModalWrapper title={title} onClose={onCancel}>
      <div className="p-6 text-white">
        <p className="text-center text-lg whitespace-pre-line leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-lg bg-gray-600 text-white font-medium hover:bg-gray-500 transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
