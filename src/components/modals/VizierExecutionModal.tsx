import { ModalWrapper } from "./ModalWrapper";

interface VizierExecutionModalProps {
  isOpen: boolean;
  targetId: number;
  vizierId: number;
  onResolve: (execute: boolean) => void;
}

export function VizierExecutionModal({
  isOpen,
  targetId,
  vizierId,
  onResolve,
}: VizierExecutionModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="👑 维齐尔强制处决"
      onClose={() => onResolve(false)}
      closeOnOverlayClick={false}
      footer={
        <div className="flex gap-4">
          <button
            onClick={() => onResolve(true)}
            className="px-10 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
          >
            强制处决
          </button>
          <button
            onClick={() => onResolve(false)}
            className="px-10 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
          >
            不使用能力
          </button>
        </div>
      }
      className="max-w-xl"
    >
      <div className="space-y-3 text-white">
        <p className="text-xl font-bold text-center">
          {targetId + 1}号 被提名，{vizierId + 1}号 维齐尔是否使用能力立即处决？
        </p>
        <p className="text-sm text-gray-300 text-center">
          规则：维齐尔可以在一次提名的投票统计后，如果至少有一名善良玩家参与投票，选择让被提名者立即被处决。
        </p>
        <p className="text-sm text-gray-300 text-center">
          注意：强制处决后，今天白天不会再发生更多的提名、投票和处决。
        </p>
      </div>
    </ModalWrapper>
  );
}
