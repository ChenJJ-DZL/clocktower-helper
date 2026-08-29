import { useEffect, useState } from "react";
import type { Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

interface StorytellerSelectModalProps {
  sourceId: number;
  roleId: string;
  roleName: string;
  description: string;
  targetCount: number;
  seats: Seat[];
  title?: string;
  confirmLabel?: string;
  filterCandidates?: (seat: Seat) => boolean;
  onConfirm: (targetIds: number[]) => void;
  onCancel: () => void;
}

/**
 * 说书人选择弹窗
 * 当能力描述中没有"选择"一词或由说书人决定特殊传承/转火目标时使用
 */
export function StorytellerSelectModal({
  sourceId,
  roleName,
  description,
  targetCount,
  seats,
  title,
  confirmLabel,
  filterCandidates,
  onConfirm,
  onCancel,
}: StorytellerSelectModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<number[]>([]);

  useEffect(() => {
    setSelectedTargets([]);
  }, []);

  const sourceSeat = seats.find((s) => s.id === sourceId);

  const toggleTarget = (id: number) => {
    setSelectedTargets((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      } else {
        // 如果已达到目标数量，替换第一个
        if (prev.length >= targetCount) {
          return [id, ...prev.slice(1)];
        }
        return [...prev, id];
      }
    });
  };

  const canConfirm = selectedTargets.length === targetCount;

  const candidateSeats = filterCandidates
    ? seats.filter(filterCandidates)
    : seats.filter((s) => s.role && s.id !== sourceId);

  return (
    <ModalWrapper
      title={title || "🎭 说书人选择目标"}
      onClose={() => {
        setSelectedTargets([]);
        onCancel();
      }}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 justify-center w-full">
          <button
            onClick={() => {
              setSelectedTargets([]);
              onCancel();
            }}
            className="flex-1 max-w-xs py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-base sm:text-lg transition shadow-md"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!canConfirm) return;
              onConfirm(selectedTargets);
              setSelectedTargets([]);
            }}
            disabled={!canConfirm}
            className="flex-1 max-w-xs py-3 sm:py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-base sm:text-lg shadow-lg shadow-amber-600/40 ring-2 ring-amber-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition btn-arcane-primary"
          >
            {confirmLabel ||
              `确认选择 (${selectedTargets.length}/${targetCount})`}
          </button>
        </div>
      }
    >
      <div className="space-y-3 w-full">
        <div className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-800/60 p-3 rounded-xl border border-white/5">
          <div className="text-sm sm:text-base font-semibold text-amber-300 mb-0.5">
            {sourceSeat ? `${sourceSeat.id + 1}号 ${roleName}` : roleName}
          </div>
          <div className="text-slate-300">{description}</div>
          <div className="text-xs text-yellow-300 mt-1.5">
            规则：该能力由说书人代为决定目标。请选择 {targetCount} 名目标玩家。
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3 p-1 w-full">
          {candidateSeats.length === 0 ? (
            <div className="col-span-full py-8 text-center text-slate-400 text-sm">
              暂无可选择的目标玩家
            </div>
          ) : (
            candidateSeats.map((s) => {
              const isSelected = selectedTargets.includes(s.id);
              const isDead = s.isDead;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleTarget(s.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? "border-amber-400 bg-amber-900/60 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400"
                      : "border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="font-black text-base sm:text-lg">
                      <span className="text-amber-400">{s.id + 1}号</span>{" "}
                      {s.role?.name || "未知"}
                    </div>
                    {isDead && (
                      <span className="text-xs text-red-400 font-medium">
                        已死亡
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="text-xs text-amber-300 font-bold mt-1">
                      ✓ 已选择
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
