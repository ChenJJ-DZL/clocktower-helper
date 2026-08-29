import { ModalWrapper } from "./ModalWrapper";

interface AttackBlockedModalProps {
  isOpen: boolean;
  targetId: number;
  reason: string;
  demonName?: string;
  onClose: () => void;
}

export function AttackBlockedModal({
  isOpen,
  targetId,
  reason,
  demonName,
  onClose,
}: AttackBlockedModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🛡️ 攻击无效判定"
      onClose={onClose}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex justify-center w-full">
          <button
            type="button"
            className="w-full max-w-md py-3.5 sm:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-2xl text-lg sm:text-xl font-black text-white shadow-xl shadow-emerald-950/60 ring-2 ring-emerald-400 cursor-pointer active:scale-[0.98]"
            onClick={onClose}
          >
            知道了
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-6 my-auto w-full">
        <div className="text-6xl sm:text-7xl md:text-8xl">🛡️</div>
        <div className="space-y-4 max-w-3xl">
          <div className="text-white text-2xl sm:text-4xl md:text-5xl font-black text-center leading-relaxed">
            {demonName
              ? `恶魔【${demonName}】攻击 ${targetId + 1}号，但因为【${reason}】，该玩家未死亡。`
              : `${targetId + 1}号因【${reason}】未受到本次攻击的影响。`}
          </div>
          <div className="text-base sm:text-xl text-slate-300 text-center font-medium mt-2 leading-relaxed">
            请根据规则继续进行后续流程。本弹窗仅作提示，不会影响后续结算。
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
