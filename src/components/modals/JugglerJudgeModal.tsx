import React, { useState } from "react";
import type { Seat } from "@/src/types/game";
import { ModalWrapper } from "./ModalWrapper";

interface JugglerJudgeModalProps {
  seatId: number;
  seats: Seat[];
  onConfirm: (correctCount: number) => void;
  onClose: () => void;
}

export const JugglerJudgeModal: React.FC<JugglerJudgeModalProps> = ({
  seatId,
  seats,
  onConfirm,
  onClose,
}) => {
  const [selectedCount, setSelectedCount] = useState<number>(0);

  const jugglerSeat = seats.find((s) => s.id === seatId);
  const jugglerName = jugglerSeat?.playerName
    ? `${seatId + 1}号 (${jugglerSeat.playerName})`
    : `${seatId + 1}号`;

  return (
    <ModalWrapper
      title="🤹 杂耍艺人猜测判定"
      onClose={onClose}
      className="max-w-2xl w-full"
      footer={
        <div className="flex items-center justify-between w-full gap-3 pt-2">
          <div className="text-sm text-slate-400">
            当晚将告知杂耍艺人：
            <span className="ml-1 text-amber-400 font-bold text-base">
              得知的数字为 {selectedCount}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedCount)}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-amber-900/30 flex items-center gap-1.5"
            >
              <span>确认记录 ({selectedCount}次)</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* 顶部规则提示 */}
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs leading-relaxed text-amber-200/90">
          <p className="font-semibold text-amber-300 mb-1">
            📜 官方运作规则：
          </p>
          <p>
            {jugglerName}【杂耍艺人】在首个白天公开猜测最多 5
            名玩家的角色。请说书人对照下方场上座位的真实身份核对猜测，点击他正确了几次（0~5
            次）。该数字将被记录，并将在当晚唤醒杂耍艺人告知他该数字。
          </p>
        </div>

        {/* 全员座位与真实身份列表 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
            <span>全场玩家座位与实际角色（用于对照核实）：</span>
            <span>共 {seats.length} 人</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
            {seats.map((s) => {
              const isJuggler = s.id === seatId;
              const isDead = !!s.isDead;
              const isCharade =
                s.role?.id === "drunk" || s.role?.id === "marionette";

              return (
                <div
                  key={s.id}
                  className={`p-2.5 rounded-xl border flex flex-col gap-0.5 transition-all text-xs ${
                    isJuggler
                      ? "bg-amber-950/40 border-amber-500/50 text-amber-200"
                      : isDead
                        ? "bg-slate-900/40 border-white/5 opacity-60 text-slate-400"
                        : "bg-slate-800/80 border-white/10 text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">
                      {s.id + 1}号 {s.playerName ? `(${s.playerName})` : ""}
                    </span>
                    {isJuggler && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                        杂耍者
                      </span>
                    )}
                    {isDead && (
                      <span className="text-[10px] bg-red-500/20 text-red-300 px-1 py-0.5 rounded">
                        亡
                      </span>
                    )}
                  </div>
                  <div className="font-medium text-amber-300/90 truncate">
                    【{s.role?.name || "未知角色"}】
                    {isCharade && s.charadeRole && (
                      <span className="text-purple-300 text-[11px] ml-1">
                        (显为{s.charadeRole.name})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 0-5 数字确认选择区 */}
        <div className="space-y-2 pt-1 border-t border-white/10">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>请点击选择杂耍艺人猜对的次数（0 - 5 次）：</span>
            <span className="text-amber-400 font-bold text-sm">
              当前选择: {selectedCount} 次
            </span>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map((num) => {
              const isSelected = selectedCount === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelectedCount(num)}
                  className={`h-14 rounded-xl font-extrabold text-xl flex flex-col items-center justify-center transition-all border ${
                    isSelected
                      ? "bg-gradient-to-b from-amber-500 to-amber-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30 scale-105"
                      : "bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-white/10 hover:border-amber-500/40"
                  }`}
                >
                  <span>{num}</span>
                  <span className="text-[10px] font-normal opacity-80">
                    {num === 0 ? "全错" : num === 5 ? "全对" : `${num}对`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};

export default JugglerJudgeModal;
