import { ModalWrapper } from './ModalWrapper';

interface SaintExecutionConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaintExecutionConfirmModal({ isOpen, onConfirm, onCancel }: SaintExecutionConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚠️ 圣徒处决警告"
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-5 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-100 font-semibold"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold"
          >
            确认处决圣徒并立即结束游戏
          </button>
        </>
      }
      className="max-w-xl bg-red-950 border-red-600"
    >
      <p className="text-lg text-gray-100 font-semibold text-center">你即将处决的是【圣徒 (Saint)】。</p>
      <p className="text-base text-red-100 text-center mt-2">一旦执行，其阵营立即失败，邪恶阵营立刻获胜。</p>
      <p className="text-sm text-red-200 text-center mt-2">若你确认要执行，请点击【确认处决圣徒并立即结束游戏】。</p>
    </ModalWrapper>
  );
}

