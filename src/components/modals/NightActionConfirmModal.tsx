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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsSubmitting(false);
    if (data?.initialSelectedTargets) {
      setSelectedTargets(data.initialSelectedTargets);
    } else {
      setSelectedTargets([]);
    }
  }, [data]);

  // 筛选已分配角色的座位，按座位号升序展示
  const seatedPlayers = useMemo(() => {
    return seats
      .filter((s) => s.role !== null && s.role !== undefined)
      .sort((a, b) => a.id - b.id);
  }, [seats]);

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

  const rawTargetText = needsTargetSelection
    ? selectedTargets.length > 0
      ? `${selectedTargets.map((id) => `${id + 1}号`).join("、")}`
      : ""
    : targetDescriptions.length > 0
      ? targetDescriptions.join("、")
      : "";

  // 严格过滤占位符文本（如 "（信息获取 - 无目标）"、"（首夜信息 - 无目标）"、"无目标" 等）
  const isPlaceholderTarget =
    !rawTargetText ||
    rawTargetText.includes("无目标") ||
    rawTargetText.includes("信息获取") ||
    rawTargetText.includes("首夜信息");

  const targetText = isPlaceholderTarget ? "" : rawTargetText.trim();

  const handleConfirm = async () => {
    if (isSubmitting || isConfirmDisabled) return;
    setIsSubmitting(true);
    try {
      await onConfirm(needsTargetSelection ? selectedTargets : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      title={`🌙 ${roleName} - 行动确认`}
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 sm:py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition text-base sm:text-lg shadow-md"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isConfirmDisabled || isSubmitting}
            onClick={handleConfirm}
            className={`flex-1 py-3 sm:py-4 rounded-xl font-black transition text-base sm:text-lg shadow-lg ${
              isConfirmDisabled || isSubmitting
                ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/40 ring-2 ring-blue-400 active:scale-[0.98]"
            }`}
          >
            {isSubmitting
              ? "处理中..."
              : needsTargetSelection
                ? selectedTargets.length === 0 && min === 0
                  ? "确认（不选目标）"
                  : `确认选择 (${selectedTargets.length}/${max})`
                : "确认执行"}
          </button>
        </div>
      }
    >
      {needsTargetSelection ? (
        /* 有目标选择交互时的布局 */
        <div className="space-y-4 text-white w-full">
          {/* 顶部行动指引 */}
          <div className="text-center space-y-1.5 max-w-full">
            <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100 break-words leading-relaxed px-2">
              确认为
              {targetText && (
                <span className="text-amber-400 font-black">
                  【{targetText}】
                </span>
              )}
              <span className="text-indigo-300 font-black">【{roleName}】</span>
              执行
              <span className="text-indigo-200"> "{actionDescription}"</span>
              吗？
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              💡
              说书人可直接将本页面展示给该玩家进行选人操作，已完全隐蔽其他玩家角色信息。
            </p>
          </div>

          {/* 选人交互网格 */}
          <div className="pt-3 border-t border-slate-700/60 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 px-1 text-xs sm:text-sm">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                请选择目标（最少 {min} 人，最多 {max} 人）
              </span>
              <span className="text-slate-400 font-medium">
                已选:{" "}
                <b className="text-amber-400 text-sm sm:text-base font-black">
                  {selectedTargets.length}
                </b>{" "}
                / {max}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3 p-1">
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
                    className={`py-2.5 sm:py-3.5 px-1.5 rounded-xl text-center border font-bold transition-all flex flex-col items-center justify-center select-none cursor-pointer active:scale-95 shadow-sm ${
                      isSelected
                        ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-400 scale-[1.02]"
                        : isDisabled
                          ? "bg-slate-900/40 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed"
                          : seat.isDead
                            ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700/80 hover:border-slate-600"
                            : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500"
                    }`}
                  >
                    <span className="text-base sm:text-lg md:text-xl font-black tracking-wide">
                      {seat.id + 1}号
                    </span>
                    {seat.isDead && (
                      <span className="text-[10px] sm:text-xs text-red-400 font-medium mt-0.5">
                        (已死亡)
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-[10px] sm:text-xs text-slate-400 font-medium mt-0.5">
                        (自己)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {extraNote && (
            <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40">
              ⚠️ {extraNote}
            </div>
          )}
        </div>
      ) : (
        /* 无需选人时的信息角色确认布局（垂直弹性居中，排版饱满优雅） */
        <div className="flex flex-col flex-1 my-auto justify-center items-center text-center space-y-6 max-w-2xl mx-auto p-4 w-full">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-indigo-950/80 border-2 border-indigo-500/40 flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-indigo-900/30">
            🌙
          </div>

          <div className="space-y-3">
            <div className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-100 leading-snug">
              确认为 <span className="text-indigo-300">【{roleName}】</span>{" "}
              执行行动
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-amber-300 bg-slate-800/80 border border-slate-700/80 rounded-2xl py-3 px-6 shadow-inner inline-block">
              "{actionDescription}"
            </div>
          </div>

          <p className="text-xs sm:text-sm md:text-base text-slate-400 max-w-lg leading-relaxed">
            💡 该角色能力为
            <span className="text-slate-200 font-semibold">
              夜间信息获取 / 自动结算
            </span>
            ，无需由玩家点选目标。点击下方【确认执行】后将计算并展示告知结果。
          </p>

          {extraNote && (
            <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40 w-full max-w-lg">
              ⚠️ {extraNote}
            </div>
          )}
        </div>
      )}
    </ModalWrapper>
  );
}
