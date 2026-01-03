import { ModalWrapper } from './ModalWrapper';

interface ExecutionResultModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
}

export function ExecutionResultModal({ isOpen, message, onConfirm }: ExecutionResultModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚖️ 处决结果"
      onClose={onConfirm}
      footer={
        <button
          onClick={onConfirm}
          className="px-12 py-4 bg-green-600 rounded-xl font-bold text-xl hover:bg-green-700 transition-colors"
        >
          确认
        </button>
      }
      className="max-w-md"
    >
      <p className="text-2xl font-bold text-white text-center">{message}</p>
    </ModalWrapper>
  );
}

