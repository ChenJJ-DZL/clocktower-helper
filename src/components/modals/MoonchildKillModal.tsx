import type { Seat } from "@/app/data";
import { displayPlayerName } from "../../utils/seatLabel";
import { AdaptiveSeatGrid, SEAT_CARD_FONT } from "../common/AdaptiveSeatGrid";
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

  const votableSeats = seats.filter((s) => !s.isDead && s.id !== sourceId);

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
        <AdaptiveSeatGrid
          count={votableSeats.length}
          renderItem={(index) => {
            const s = votableSeats[index];
            return (
              <button
                type="button"
                onClick={() => onConfirm(s.id)}
                className="w-full h-full px-2 border-2 border-purple-400/80 rounded-2xl font-black bg-slate-800/80 hover:bg-purple-900/60 hover:border-purple-300 transition-all flex flex-col items-center justify-center gap-1 shadow-sm text-white active:scale-95"
              >
                <span
                  className="text-amber-400 font-bold leading-none"
                  style={{ fontSize: SEAT_CARD_FONT.primary }}
                >
                  {s.id + 1}号
                </span>
                <span
                  className="truncate max-w-full leading-tight"
                  style={{ fontSize: SEAT_CARD_FONT.secondary }}
                >
                  {s.role?.name ?? "未知"}
                </span>
              </button>
            );
          }}
        />
      </div>
    </ModalWrapper>
  );
}
