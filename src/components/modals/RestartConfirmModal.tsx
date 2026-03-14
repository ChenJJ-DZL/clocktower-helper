import { ModalWrapper } from "./ModalWrapper";

interface RestartConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestartConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
}: RestartConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🔄 确认重开"
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
          >
            确认
          </button>
        </>
      }
      className="max-w-md"
    >
      <p className="text-2xl font-bold text-white text-center">
        确定重开游戏吗？
      </p>
    </ModalWrapper>
  );
}
