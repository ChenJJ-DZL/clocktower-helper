import { ModalWrapper } from "./ModalWrapper";

interface ExecutionResultModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
}

export function ExecutionResultModal({
  isOpen,
  message,
  onConfirm,
}: ExecutionResultModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚖️ 处决结果"
      onClose={onConfirm}
      footer={
        <button
          onClick={onConfirm}
          className="px-12 py-4 bg-green-600 rounded-xl font-bold text-xl hover:bg-green-700 transition-colors shadow-md"
        >
          确认
        </button>
      }
      className="max-w-md"
    >
      <div className="text-center py-2 space-y-3">
        <div className="text-xl text-amber-200/90 font-medium">处决判定：</div>
        <div className="text-3xl font-black text-amber-400 text-center tracking-wide drop-shadow-md">
          {message.startsWith("【") ? message : `【${message}】`}
        </div>
      </div>
    </ModalWrapper>
  );
}
