"use client";

import React, { useState } from "react";
import type { Seat } from "../../../app/data";
import type { NightInfoResult } from "../../types/game";

interface NightActionPageProps {
  /** 当前夜间行动的角色信息 */
  nightInfo: NightInfoResult;
  /** 所有座位 */
  seats: Seat[];
  /** 已选中的目标 */
  selectedTargets: number[];
  /** 切换目标选中状态 */
  onToggleTarget: (seatId: number) => void;
  /** 确认执行 */
  onConfirm: () => void;
  /** 取消/跳过 */
  onCancel: () => void;
  /** 确认按钮是否禁用 */
  isConfirmDisabled: boolean;
  /** 角色能力描述（guide 文案） */
  guideText?: string;
  /** 是否受干扰（中毒/醉酒） */
  isDisturbed?: boolean;
  /** 结果文本（执行后展示） */
  resultText?: string;
  /** 结果确认回调 */
  onResultConfirm?: () => void;
}

/**
 * NightActionPage - 全屏夜间行动页面
 *
 * 遮住后方所有信息，仅保留顶部导航栏可操作。
 * 成为当前行动角色的专属行动界面：
 * - 展示角色名称、能力描述、干扰状态
 * - 需要选人时展示目标选择网格
 * - 执行后展示结果信息
 * - 仅允许当前角色的技能交互
 */
export function NightActionPage({
  nightInfo,
  seats,
  selectedTargets,
  onToggleTarget,
  onConfirm,
  onCancel,
  isConfirmDisabled,
  guideText,
  isDisturbed,
  resultText,
  onResultConfirm,
}: NightActionPageProps) {
  const [showResult, setShowResult] = useState(false);

  const roleName = nightInfo.seat?.role?.name || "未知角色";
  const roleType = nightInfo.seat?.role?.type || "unknown";
  const seatId = nightInfo.seat?.id ?? 0;
  const targetLimit = nightInfo.targetLimit;
  const needsTargets = targetLimit && targetLimit.max > 0;

  // 阵营颜色映射
  const factionColors: Record<string, { bg: string; text: string; border: string }> = {
    townsfolk: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/40" },
    outsider: { bg: "bg-purple-500/20", text: "text-purple-300", border: "border-purple-500/40" },
    minion: { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/40" },
    demon: { bg: "bg-red-600/30", text: "text-red-200", border: "border-red-600/50" },
    traveler: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/40" },
  };
  const faction = factionColors[roleType] || factionColors.townsfolk;

  const hasResult = !!resultText;

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-black/80 backdrop-blur-md">
      {/* 顶部留空给导航栏 */}
      <div className="h-12 shrink-0" />

      {/* 主内容区 */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-2xl space-y-6">
          {/* 角色信息卡 */}
          <div className={`rounded-2xl border ${faction.border} ${faction.bg} p-6 backdrop-blur-xl`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-16 h-16 rounded-full ${faction.bg} border-2 ${faction.border} flex items-center justify-center text-2xl font-black ${faction.text}`}>
                {seatId + 1}
              </div>
              <div>
                <h2 className={`text-2xl font-black ${faction.text}`}>
                  {roleName}
                </h2>
                <p className="text-sm text-slate-400">
                  {seatId + 1}号玩家 · {roleType === "townsfolk" ? "镇民" : roleType === "outsider" ? "外来者" : roleType === "minion" ? "爪牙" : roleType === "demon" ? "恶魔" : roleType}
                </p>
              </div>
              {isDisturbed && (
                <span className="ml-auto px-3 py-1 rounded-full bg-red-900/50 text-red-300 text-sm font-bold border border-red-700/50">
                  ⚠️ 受干扰
                </span>
              )}
            </div>

            {/* 能力描述 */}
            {guideText && (
              <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                <p className="text-base text-slate-200 leading-relaxed">
                  {guideText}
                </p>
              </div>
            )}
          </div>

          {/* 结果展示区（执行后内联展示）*/}
          {hasResult && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-amber-300 mb-3">📋 执行结果</h3>
              <p className="text-base text-amber-100 leading-relaxed">{resultText}</p>
              <button
                onClick={onResultConfirm}
                className="mt-4 w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg transition-colors"
              >
                确认并继续
              </button>
            </div>
          )}

          {/* 目标选择区（仅在无结果时展示）*/}
          {needsTargets && !hasResult && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4">
                选择目标（{selectedTargets.length}/{targetLimit.max}）
              </h3>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {seats.map((seat) => {
                  if (!seat.role) return null;
                  const isSelected = selectedTargets.includes(seat.id);
                  const isSelf = seat.id === seatId;
                  const isValid = nightInfo.validTargetIds
                    ? nightInfo.validTargetIds.includes(seat.id)
                    : true;

                  return (
                    <button
                      key={seat.id}
                      onClick={() => onToggleTarget(seat.id)}
                      disabled={isSelf || !isValid}
                      className={`relative px-2 py-3 rounded-xl text-center border transition-all duration-200 ${
                        isSelected
                          ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/50"
                          : seat.isDead
                            ? "bg-slate-900/40 border-slate-800 text-slate-600 line-through opacity-60"
                            : isSelf
                              ? "bg-slate-900/40 border-slate-700 text-slate-500 opacity-40"
                              : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="text-lg font-bold">{seat.id + 1}</span>
                      <span className="block text-[10px] opacity-60 mt-0.5 truncate">
                        {seat.role.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 操作按钮区 */}
          {!showResult && (
            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className="flex-1 py-4 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 font-bold text-lg transition-colors border border-white/5"
              >
                跳过
              </button>
              <button
                onClick={onConfirm}
                disabled={isConfirmDisabled}
                className={`flex-[2] py-4 rounded-xl font-bold text-lg transition-all ${
                  isConfirmDisabled
                    ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                }`}
              >
                确认执行
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
