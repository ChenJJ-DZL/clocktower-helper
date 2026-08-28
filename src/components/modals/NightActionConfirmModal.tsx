"use client";

import { useEffect, useMemo, useState } from "react";
import type { Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

export interface NightActionConfirmData {
  /** 角色中文名，如 "12号-投毒者" */
  roleName: string;
  /** 行动描述，如 "选择一名玩家进行下毒" */
  actionDescription: string;
  /** 被选中的目标描述列表，如 ["3号", "5号"] */
  targetDescriptions?: string[];
  /** 附加提示，如中毒/醉酒警告 */
  extraNote?: string;
  /** 目标选择配置 */
  targetLimit?: { min: number; max: number };
  /** 当前行动者座位ID（用于自身可选性判断） */
  actorSeatId?: number;
  /** 允许选自己吗（默认 true） */
  allowSelf?: boolean;
  /** 仅存活玩家可选（默认 false） */
  aliveOnly?: boolean;
  /** 初始已选中的目标ID列表 */
  initialSelectedTargets?: number[];
  /** 确认回调，接收选中的目标ID列表 */
  onConfirm: (selectedTargetIds?: number[]) => void | Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
}

interface NightActionConfirmModalProps {
  data: NightActionConfirmData | null;
  seats?: Seat[];
  onConfirm: (selectedTargetIds?: number[]) => void;
  onCancel: () => void;
}

export function NightActionConfirmModal({
  data,
  seats = [],
  onConfirm,
  onCancel,
}: NightActionConfirmModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<number[]>([]);

  useEffect(() => {
    if (data?.initialSelectedTargets) {
      setSelectedTargets(data.initialSelectedTargets);
    } else {
      setSelectedTargets([]);
    }
  }, [data]);

  if (!data) return null;

  const {
    roleName,
    actionDescription,
    targetDescriptions = [],
    extraNote,
    targetLimit,
    actorSeatId,
    allowSelf = true,
    aliveOnly = false,
  } = data;

  const min = targetLimit?.min ?? 0;
  const max = targetLimit?.max ?? 0;
  const needsTargetSelection = max > 0;

  // 筛选已分配角色的座位，按座位号升序展示
  const seatedPlayers = useMemo(() => {
    return seats
      .filter((s) => s.role !== null && s.role !== undefined)
      .sort((a, b) => a.id - b.id);
  }, [seats]);

  const handleToggleTarget = (seatId: number) => {
    setSelectedTargets((prev) => {
      if (prev.includes(seatId)) {
        return prev.filter((id) => id !== seatId);
      }
      if (max === 1) {
        return [seatId];
      }
      if (prev.length < max) {
        return [...prev, seatId];
      }
      // 若已达上限且 max > 1，移除首个并加入新选的
      return [...prev.slice(1), seatId];
    });
  };

  const isConfirmDisabled =
    needsTargetSelection && selectedTargets.length < min;

  const targetText = needsTargetSelection
    ? selectedTargets.length > 0
      ? selectedTargets.map((id) => `${id + 1}号`).join("、") + " "
      : ""
    : targetDescriptions.length > 0
      ? targetDescriptions.join("、") + " "
      : "";

  return (
    <ModalWrapper
      title={`🌙 ${roleName} - 行动确认`}
      onClose={onCancel}
      className={needsTargetSelection ? "max-w-xl sm:max-w-2xl w-full" : "max-w-md sm:max-w-lg w-full"}
      footer={
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition text-sm shadow-md"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isConfirmDisabled}
            onClick={() =>
              onConfirm(needsTargetSelection ? selectedTargets : undefined)
            }
            className={`flex-1 py-3 rounded-xl font-black transition text-sm shadow-md ${
              isConfirmDisabled
                ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/40 ring-1 ring-blue-400 active:scale-[0.98]"
            }`}
          >
            {needsTargetSelection
              ? selectedTargets.length === 0 && min === 0
                ? "确认（不选目标）"
                : `确认选择 (${selectedTargets.length}/${max})`
              : "确认执行"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-2 text-white max-w-full overflow-hidden">
        {/* 顶部行动指引 */}
        <div className="text-center space-y-2 max-w-full">
          <div className="text-sm sm:text-base md:text-lg font-bold text-slate-100 break-words leading-relaxed px-2">
            确认为{targetText && <span className="text-amber-400">【{targetText.trim()}】</span>}
            <span className="text-indigo-300">【{roleName}】</span>
            执行
            <span className="text-indigo-200"> "{actionDescription}"</span>
            吗？
          </div>
          <p className="text-xs text-slate-400">
            💡 说书人可直接将本页面展示给该玩家进行选人操作，已完全隐蔽其他玩家角色信息。
          </p>
        </div>

        {/* 选人交互网格（绝不展示其他玩家角色名称，仅展示座位号与状态） */}
        {needsTargetSelection && (
          <div className="pt-3 border-t border-slate-700/60">
            <div className="flex items-center justify-between mb-3 px-1 text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                请选择目标（最少 {min} 人，最多 {max} 人）
              </span>
              <span className="text-slate-400 font-medium">
                已选: <b className="text-amber-400 text-sm">{selectedTargets.length}</b> / {max}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-[45vh] overflow-y-auto p-1">
              {seatedPlayers.map((seat) => {
                const isSelected = selectedTargets.includes(seat.id);
                const isSelf = seat.id === actorSeatId;
                const isSelfDisabled = isSelf && allowSelf === false;
                const isDeadDisabled = seat.isDead && aliveOnly === true;
                const isDisabled = isSelfDisabled || isDeadDisabled;

                return (
                  <button
                    key={seat.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleToggleTarget(seat.id)}
                    className={`py-3 px-2 rounded-xl text-center border font-bold transition-all flex flex-col items-center justify-center select-none cursor-pointer active:scale-95 ${
                      isSelected
                        ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-400 scale-[1.02]"
                        : isDisabled
                          ? "bg-slate-900/40 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed"
                          : seat.isDead
                            ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700/80 hover:border-slate-600"
                            : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500 shadow-sm"
                    }`}
                  >
                    <span className="text-base font-black tracking-wide">
                      {seat.id + 1}号
                    </span>
                    {seat.isDead && (
                      <span className="text-[10px] text-red-400 font-normal mt-0.5">
                        (已死亡)
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                        (自己)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {extraNote && (
          <div className="text-xs text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40">
            ⚠️ {extraNote}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
