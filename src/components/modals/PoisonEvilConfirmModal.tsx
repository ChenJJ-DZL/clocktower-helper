import { ModalWrapper } from './ModalWrapper';

interface PoisonEvilConfirmModalProps {
  targetId: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PoisonEvilConfirmModal({ targetId, onConfirm, onCancel }: PoisonEvilConfirmModalProps) {
  if (targetId === null) return null;

  return (
    <ModalWrapper
      title="⚠️ 警告"
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
      <p className="text-xl font-bold text-white mb-4 text-center">该玩家是邪恶阵营</p>
      <p className="text-lg font-bold text-yellow-400 text-center">确认对{targetId+1}号玩家下毒吗？</p>
    </ModalWrapper>
  );
}

