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
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 max-w-xs py-3.5 sm:py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-lg sm:text-xl text-slate-300 transition border border-slate-700 cursor-pointer active:scale-95"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 max-w-xs py-3.5 sm:py-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 rounded-2xl font-black text-lg sm:text-xl text-white transition shadow-xl shadow-red-950/60 ring-2 ring-red-400 cursor-pointer active:scale-[0.98]"
          >
            确认
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4 my-auto w-full">
        <div className="text-6xl sm:text-7xl">
          {isImpSelfKill ? "👑" : "💀"}
        </div>
        {isImpSelfKill ? (
          <>
            <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-relaxed">
              确认选择自己自杀传位吗？
            </p>
            <p className="text-base sm:text-xl md:text-2xl font-bold text-amber-300">
              小恶魔身份将转移给场上的一名存活爪牙，你将在今晚死亡。
            </p>
          </>
        ) : (
          <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-relaxed">
            确认杀死{" "}
            <span className="text-amber-400 font-black">
              【{targetId + 1}号】
            </span>{" "}
            玩家吗？
          </p>
        )}
      </div>
    </ModalWrapper>
  );
}
