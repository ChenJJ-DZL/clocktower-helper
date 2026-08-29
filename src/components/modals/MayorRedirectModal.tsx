import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface MayorRedirectModalProps {
  isOpen: boolean;
  targetId: number;
  demonName: string;
  seats: Seat[];
  selectedTarget: number | null;
  onSelectTarget: (targetId: number) => void;
  onConfirmNoRedirect: () => void;
  onConfirmRedirect: (targetId: number) => void;
}

export function MayorRedirectModal({
  isOpen,
  targetId,
  demonName,
  seats,
  selectedTarget,
  onSelectTarget,
  onConfirmNoRedirect,
  onConfirmRedirect,
}: MayorRedirectModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🏛️ 市长被攻击"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex flex-wrap gap-4 justify-center w-full">
          <button
            onClick={onConfirmNoRedirect}
            className="flex-1 max-w-xs py-3 sm:py-4 bg-red-600 rounded-xl font-bold text-base sm:text-lg text-white hover:bg-red-500 transition shadow-md shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98]"
          >
            不转移，让市长死亡
          </button>
          <button
            disabled={selectedTarget === null}
            onClick={() =>
              selectedTarget !== null && onConfirmRedirect(selectedTarget)
            }
            className={`flex-1 max-w-xs py-3 sm:py-4 rounded-xl font-black text-base sm:text-lg transition shadow-md ${
              selectedTarget === null
                ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                : "bg-amber-500 text-black hover:bg-amber-400 ring-2 ring-amber-300 shadow-amber-500/40 active:scale-[0.98]"
            }`}
          >
            {selectedTarget !== null
              ? `转移给 ${selectedTarget + 1}号`
              : "请选择替死玩家"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-3 w-full">
        <p className="text-lg sm:text-xl text-white font-bold text-center">
          恶魔（{demonName}）攻击了{" "}
          <span className="text-amber-400 font-black">
            【{targetId + 1}号】
          </span>{" "}
          (市长)。
        </p>
        <p className="text-sm sm:text-base text-amber-200 text-center font-medium">
          是否要转移死亡目标？选择一名存活玩家代替死亡，或让市长死亡。
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 p-1 w-full">
          {seats
            .filter((s) => !s.isDead && s.id !== targetId)
            .map((seat) => (
              <button
                key={seat.id}
                onClick={() => onSelectTarget(seat.id)}
                className={`py-3 sm:py-4 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-0.5 ${
                  selectedTarget === seat.id
                    ? "border-amber-400 bg-amber-500/30 ring-2 ring-amber-400 scale-[1.02]"
                    : "border-slate-700 bg-slate-800/80 hover:bg-slate-700/80"
                }`}
              >
                <div className="text-base sm:text-lg font-black text-amber-400">
                  {seat.id + 1}号
                </div>
                <div className="text-xs sm:text-sm text-slate-200 truncate">
                  {seat.role?.name || "未分配"}
                </div>
                {seat.isProtected && (
                  <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                    被保护
                  </div>
                )}
              </button>
            ))}
        </div>
      </div>
    </ModalWrapper>
  );
}
