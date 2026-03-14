import { useEffect, useState } from "react";
import type { Seat } from "../../../app/data";

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
  roleId,
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
    <div className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-purple-500 relative w-[720px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-3xl font-bold mb-4 text-purple-200">
          🎭 说书人选择目标
        </h3>

        <div className="mb-4 text-sm text-gray-200 leading-relaxed">
          <div className="text-lg font-semibold text-purple-300 mb-2">
            {sourceSeat ? `${sourceSeat.id + 1}号 ${roleName}` : roleName}
          </div>
          <div className="text-gray-300 mb-2">{description}</div>
          <div className="text-xs text-yellow-300 mt-2">
            规则：此能力描述中没有"选择"一词，因此由说书人选择目标
          </div>
          <div className="text-xs text-yellow-200 mt-1">
            需要选择 {targetCount} 名玩家
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {seats
            .filter((s) => s.role)
            .map((s) => {
              const isSelected = selectedTargets.includes(s.id);
              const isSource = s.id === sourceId;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={isSource}
                  onClick={() => toggleTarget(s.id)}
                  className={`p-3 rounded-xl border-2 text-left transition ${
                    isSource
                      ? "border-gray-700 bg-gray-900/50 text-gray-500 cursor-not-allowed"
                      : isSelected
                        ? "border-purple-400 bg-purple-900/60 text-white shadow-lg shadow-purple-500/30"
                        : "border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
                  }`}
                  title={
                    isSource
                      ? "不能选择自己"
                      : isSelected
                        ? "已选中"
                        : "点击选择"
                  }
                >
                  <div className="flex justify-between items-center">
                    <div className="font-bold">
                      {s.id + 1}号 {s.playerName || ""}
                    </div>
                    <div className="text-xs text-gray-300">
                      {s.isDead ? "💀" : "存活"}
                    </div>
                  </div>
                  {s.role && (
                    <div className="text-xs text-gray-400 mt-1">
                      {s.role.name}
                    </div>
                  )}
                </button>
              );
            })}
        </div>

        <div className="mb-4 text-sm text-gray-100">
          <div>
            当前选中：
            <span className="font-bold text-purple-200 text-lg">
              {selectedTargets.length}
            </span>{" "}
            / {targetCount}
          </div>
          {selectedTargets.length > 0 && (
            <div className="text-xs text-gray-300 mt-1">
              已选玩家：
              {selectedTargets
                .map((id) => {
                  const seat = seats.find((s) => s.id === id);
                  return `${id + 1}号${seat?.role?.name ? `(${seat.role.name})` : ""}`;
                })
                .join("、")}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              if (!canConfirm) {
                alert(`请选择 ${targetCount} 名玩家`);
                return;
              }
              onConfirm(selectedTargets);
              setSelectedTargets([]);
            }}
            disabled={!canConfirm}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认选择 ({selectedTargets.length}/{targetCount})
          </button>
          <button
            onClick={() => {
              setSelectedTargets([]);
              onCancel();
            }}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold shadow"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
