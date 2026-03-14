import { ModalWrapper } from "./ModalWrapper";

interface KillConfirmModalProps {
  targetId: number | null;
  isImpSelfKill: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KillConfirmModal({
  targetId,
  isImpSelfKill,
  onConfirm,
  onCancel,
}: KillConfirmModalProps) {
  if (targetId === null) return null;

  return (
    <ModalWrapper
      title={isImpSelfKill ? "👑 确认转移身份" : "💀 确认杀死玩家"}
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
      {isImpSelfKill ? (
        <>
          <p className="text-2xl font-bold text-white mb-4">确认选择自己吗？</p>
          <p className="text-lg text-yellow-400">
            身份将转移给场上的一个爪牙，你将在夜晚死亡
          </p>
        </>
      ) : (
        <p className="text-2xl font-bold text-white">
          确认杀死{targetId + 1}号玩家吗？
        </p>
      )}
    </ModalWrapper>
  );
}
