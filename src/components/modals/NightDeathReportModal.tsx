import { ModalWrapper } from './ModalWrapper';

interface NightDeathReportModalProps {
  message: string | null;
  onConfirm: () => void;
}

export function NightDeathReportModal({ message, onConfirm }: NightDeathReportModalProps) {
  if (!message) return null;

  return (
    <ModalWrapper
      title="🌙 夜晚报告"
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

