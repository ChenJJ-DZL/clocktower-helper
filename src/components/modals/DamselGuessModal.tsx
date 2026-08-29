import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface DamselGuessModalProps {
  isOpen: boolean;
  minionId: number | null;
  targetId: number | null;
  seats: Seat[];
  damselGuessUsedBy: number[];
  onMinionChange: (minionId: number | null) => void;
  onTargetChange: (targetId: number | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DamselGuessModal({
  isOpen,
  minionId,
  targetId,
  seats,
  damselGuessUsedBy,
  onMinionChange,
  onTargetChange,
  onConfirm,
  onCancel,
}: DamselGuessModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="👧 爪牙猜测落难少女"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-pink-500"
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
              minionId === null || targetId === null
                ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                : "bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/40 ring-2 ring-pink-400 active:scale-[0.98]"
            }`}
            onClick={onConfirm}
            disabled={minionId === null || targetId === null}
          >
            确定
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-2 sm:p-4 flex flex-col flex-1 w-full">
        <div className="text-xs sm:text-sm text-pink-200">
          规则：每名存活爪牙每局仅可猜测 1
          次落难少女。若猜中落难少女，邪恶阵营立即获胜。
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs sm:text-sm text-slate-300 font-medium mb-1 block">
              发起猜测的爪牙：
            </label>
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-base sm:text-lg font-bold"
              value={minionId ?? ""}
              onChange={(e) =>
                onMinionChange(
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            >
              <option value="">选择爪牙</option>
              {seats
                .filter(
                  (s) =>
                    s.role?.type === "minion" &&
                    !s.isDead &&
                    !damselGuessUsedBy.includes(s.id)
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.id + 1}号] {s.role?.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs sm:text-sm text-slate-300 font-medium mb-1 block">
              被猜测的玩家（怀疑是少女）：
            </label>
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-base sm:text-lg font-bold"
              value={targetId ?? ""}
              onChange={(e) =>
                onTargetChange(
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            >
              <option value="">选择被猜测的玩家</option>
              {seats
                .filter(
                  (s) => !s.isDead && (minionId === null || s.id !== minionId)
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.id + 1}号] {s.playerName || `座位${s.id + 1}`}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
