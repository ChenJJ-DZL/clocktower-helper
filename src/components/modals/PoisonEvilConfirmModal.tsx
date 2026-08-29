import { ModalWrapper } from "./ModalWrapper";

interface PoisonEvilConfirmModalProps {
  targetId: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PoisonEvilConfirmModal({
  targetId,
  onConfirm,
  onCancel,
}: PoisonEvilConfirmModalProps) {
  if (targetId === null) return null;

  return (
    <ModalWrapper
      title="⚠️ 警告"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-red-500"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            onClick={onCancel}
            className="flex-1 max-w-xs py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-base sm:text-lg text-white transition shadow-md"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 max-w-xs py-3 sm:py-4 bg-red-600 hover:bg-red-500 rounded-xl font-black text-base sm:text-lg text-white transition shadow-lg shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98]"
          >
            确认
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-6 space-y-4 text-center my-auto w-full">
        <p className="text-2xl sm:text-3xl md:text-4xl font-black text-red-400">
          该玩家是邪恶阵营
        </p>
        <p className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-300">
          确认对{" "}
          <span className="text-amber-400 font-black">
            【{targetId + 1}号】
          </span>{" "}
          玩家下毒吗？
        </p>
      </div>
    </ModalWrapper>
  );
}
