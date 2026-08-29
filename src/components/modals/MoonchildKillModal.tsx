import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface MoonchildKillModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  onConfirm: (targetId: number) => void;
}

export function MoonchildKillModal({
  isOpen,
  sourceId,
  seats,
  onConfirm,
}: MoonchildKillModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🌙 月之子已死：选择陪葬目标"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-purple-500"
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-4 w-full">
        <p className="text-lg sm:text-xl md:text-2xl text-amber-200 font-bold text-center">
          请选择一名玩家与其陪葬：
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 p-1 w-full">
          {seats
            .filter((s) => !s.isDead && s.id !== sourceId)
            .map((s) => (
              <button
                key={s.id}
                onClick={() => onConfirm(s.id)}
                className="py-3 sm:py-4 px-2 border-2 border-purple-400/80 rounded-xl text-base sm:text-lg font-black bg-slate-800/80 hover:bg-purple-900/60 hover:border-purple-300 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm text-white active:scale-95"
              >
                <span className="text-amber-400 font-bold">{s.id + 1}号</span>
                <span className="truncate">{s.role?.name ?? "未知"}</span>
                {s.playerName && (
                  <span className="text-[10px] sm:text-xs text-slate-400 font-normal truncate">
                    ({s.playerName})
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>
    </ModalWrapper>
  );
}
