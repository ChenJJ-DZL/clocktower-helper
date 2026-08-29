import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface KlutzChoiceModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  selectedTarget: number | null;
  onSelectTarget: (targetId: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KlutzChoiceModal({
  isOpen,
  sourceId,
  seats,
  selectedTarget,
  onSelectTarget,
  onConfirm,
  onCancel,
}: KlutzChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🤪 呆瓜死亡判定"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-yellow-500"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-base sm:text-lg text-white transition shadow-md"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`flex-1 max-w-xs py-3 sm:py-4 rounded-xl font-black text-base sm:text-lg transition shadow-lg ${
              selectedTarget === null
                ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/40 ring-2 ring-amber-400 active:scale-[0.98]"
            }`}
            onClick={onConfirm}
            disabled={selectedTarget === null}
          >
            确认选择
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-4 w-full">
        <p className="text-lg sm:text-xl md:text-2xl text-amber-200 font-bold text-center">
          请选择一名存活玩家：若其为邪恶，善良阵营立即失败。
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 p-1 w-full">
          {seats
            .filter((s) => !s.isDead && s.id !== sourceId)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectTarget(s.id)}
                className={`py-3 sm:py-4 px-2 border-2 rounded-xl text-base sm:text-lg font-black transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm cursor-pointer ${
                  selectedTarget === s.id
                    ? "border-amber-400 bg-amber-600 text-white shadow-md ring-2 ring-amber-400 scale-[1.02]"
                    : "border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-slate-100"
                }`}
              >
                <span className="text-amber-300 font-bold">{s.id + 1}号</span>
                <span className="truncate">{s.role?.name || "未知"}</span>
              </button>
            ))}
        </div>
      </div>
    </ModalWrapper>
  );
}
