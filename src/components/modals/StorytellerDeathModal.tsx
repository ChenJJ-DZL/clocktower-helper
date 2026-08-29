import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface StorytellerDeathModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  onConfirm: (targetId: number | null) => void;
}

export function StorytellerDeathModal({
  isOpen,
  seats,
  onConfirm,
}: StorytellerDeathModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="📖 说书人决定今晚死亡"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-red-500"
      footer={
        <div className="flex justify-center w-full">
          <button
            onClick={() => onConfirm(null)}
            className="w-full max-w-md py-3 sm:py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-gray-100 font-bold text-base sm:text-lg transition-colors shadow-md"
          >
            本晚无人死亡（高级裁决）
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-3 w-full">
        <p className="text-lg sm:text-xl text-gray-200 font-bold text-center">
          麻脸巫婆造出新恶魔后，请指定今晚死亡的玩家（可选择"无人死亡"）。
        </p>
        <p className="text-xs sm:text-sm text-red-300 text-center">
          你通过麻脸巫婆创造了一个新恶魔。按规则，本晚通常必须有人死亡（除非你有意让这是一个特殊裁决）。
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 p-1 w-full">
          {seats
            .filter((s) => !s.isDead)
            .map((s) => (
              <button
                key={s.id}
                onClick={() => onConfirm(s.id)}
                className="py-3 sm:py-4 px-2 border-2 border-red-400 rounded-xl text-base sm:text-lg font-black bg-slate-800/80 hover:bg-red-900/60 hover:border-red-300 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm text-white active:scale-95"
              >
                <span className="text-amber-400 font-bold">{s.id + 1}号</span>
                <span className="truncate">{s.role?.name ?? ""}</span>
              </button>
            ))}
        </div>
      </div>
    </ModalWrapper>
  );
}
