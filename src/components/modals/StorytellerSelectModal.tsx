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
  onConfirm: (targetIds: number[]) => void;
  onCancel: () => void;
}

/**
 * 说书人选择弹窗
 * 当能力描述中没有"选择"一词时，由说书人选择目标
 * 参考投票计票环节的设计
 */
export function StorytellerSelectModal({
  sourceId,
  roleName,
  description,
  targetCount,
  seats,
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

  return (
    <ModalWrapper
      title="🎭 说书人选择目标"
      onClose={() => {
        setSelectedTargets([]);
        onCancel();
      }}
      className="max-w-2xl"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button
            onClick={() => {
              setSelectedTargets([]);
              onCancel();
            }}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition"
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
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            确认选择 ({selectedTargets.length}/{targetCount})
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-200 leading-relaxed bg-slate-800/60 p-3 rounded-xl border border-white/5">
          <div className="text-base font-semibold text-purple-300 mb-1">
            {sourceSeat ? `${sourceSeat.id + 1}号 ${roleName}` : roleName}
          </div>
          <div className="text-slate-300">{description}</div>
          <div className="text-xs text-yellow-300 mt-2">
            规则：该能力由说书人代为选择目标。请选择 {targetCount} 名玩家。
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {seats
            .filter((s) => s.role && s.id !== sourceId)
            .map((s) => {
              const isSelected = selectedTargets.includes(s.id);
              const isDead = s.isDead;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleTarget(s.id)}
                  className={`p-3 rounded-xl border-2 text-left transition ${
                    isSelected
                      ? "border-purple-400 bg-purple-900/60 text-white shadow-lg shadow-purple-500/30"
                      : "border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="font-bold">
                      {s.id + 1}号 {s.role?.name}
                    </div>
                    {isDead && (
                      <span className="text-xs text-slate-500">已死亡</span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="text-xs text-purple-300 font-bold mt-1">
                      ✓ 已选择
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </ModalWrapper>
  );
}
