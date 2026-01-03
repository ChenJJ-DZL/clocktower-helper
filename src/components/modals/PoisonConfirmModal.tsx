import { ModalWrapper } from './ModalWrapper';

interface PoisonConfirmModalProps {
  targetId: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PoisonConfirmModal({ targetId, onConfirm, onCancel }: PoisonConfirmModalProps) {
  if (targetId === null) return null;

  return (
    <ModalWrapper
      title="🧪 确认下毒"
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
            className="px-8 py-4 bg-purple-600 rounded-xl font-bold text-xl hover:bg-purple-700 transition-colors"
          >
            确认
          </button>
        </>
      }
      className="max-w-md"
    >
      <p className="text-2xl font-bold text-white text-center">确认对{targetId+1}号玩家下毒吗？</p>
    </ModalWrapper>
  );
}

