"use client";

import type React from "react";
import type { GamePhase, Seat } from "@/app/data";
import { showAlert } from "../utils/nativeDialogShim";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface ControlPanelProps {
  gamePhase: GamePhase;
  seats: Seat[];
  currentWakeIndex: number;
  history: Array<{
    seats: Seat[];
    gamePhase: GamePhase;
    nightCount: number;
    executedPlayerId: number | null;
    wakeQueueIds: number[];
    currentWakeIndex: number;
    selectedActionTargets: number[];
    gameLogs: any[];
    currentHint?: any;
  }>;
  isConfirmDisabled: boolean;
  evilTwinPair: { evilId: number; goodId: number } | null;
  remainingDays: number | null;
  setRemainingDays: (days: number | null) => void;
  cerenovusTarget: { targetId: number; roleName: string } | null;
  nightCount: number;
  timer: number;
  isTimerRunning: boolean;
  onTimerPause: () => void;
  onTimerStart: () => void;
  onTimerReset: () => void;
  onPreStartNight: () => void;
  onStartNight: (isFirst: boolean) => void;
  onStepBack: () => void;
  onConfirmAction: () => void;
  onDayEndTransition: () => void;
  onExecuteJudgment: () => void;
  onSetGamePhase: (phase: GamePhase) => void;
  onSetShowMadnessCheckModal: (
    modal: { targetId: number; roleName: string; day: number } | null
  ) => void;
  onAddLog: (msg: string) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  gamePhase,
  seats,
  currentWakeIndex: _currentWakeIndex,
  history: _history,
  isConfirmDisabled,
  evilTwinPair,
  remainingDays,
  setRemainingDays,
  cerenovusTarget,
  nightCount,
  timer,
  isTimerRunning,
  onTimerPause,
  onTimerStart,
  onTimerReset,
  onPreStartNight,
  onStartNight,
  onStepBack: _onStepBack,
  onConfirmAction,
  onDayEndTransition,
  onExecuteJudgment,
  onSetGamePhase,
  onSetShowMadnessCheckModal,
  onAddLog,
}) => {
  return (
    <div className="w-full p-4 flex flex-col gap-2">
      {/* Timer display */}
      <div className="flex items-center justify-center gap-3 text-white">
        <span className="text-3xl font-mono font-bold tabular-nums">
          {formatTimer(timer)}
        </span>
        <button
          onClick={isTimerRunning ? onTimerPause : onTimerStart}
          className="px-3 py-1 bg-gray-600 rounded-lg text-sm font-bold hover:bg-gray-500 transition-colors"
        >
          {isTimerRunning ? "⏸" : "▶"}
        </button>
        <button
          onClick={onTimerReset}
          className="px-3 py-1 bg-gray-600 rounded-lg text-sm font-bold hover:bg-gray-500 transition-colors"
        >
          ↺
        </button>
      </div>
      {/* Controls */}
      <div className="flex gap-3 justify-center">
        {gamePhase === "setup" && (() => {
          const activeCount = seats.filter((s) => !!s.role).length;
          return (
            <button
              onClick={() => {
                if (activeCount < 5) {
                  showAlert(`当前仅有 ${activeCount} 名玩家落座，最少需 5 名玩家才能开始游戏。请先在圆桌上为玩家分配角色。`);
                  return;
                }
                onPreStartNight();
              }}
              disabled={activeCount < 5}
              className="w-full py-3 bg-indigo-600 rounded-xl font-bold text-base shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activeCount < 5 ? `请先为至少5名玩家落座 (${activeCount}/5)` : "开始游戏 (首夜)"}
            </button>
          );
        })()}
        {gamePhase === "check" &&
          (() => {
            const seatedCount = seats.filter((s) => !!s.role).length;
            const hasDemon = seats.some(
              (s) => s.role?.type === "demon" || s.role?.id === "legion"
            );
            const hasPendingCharade = seats.some(
              (s) =>
                (s.role?.id === "drunk" || s.role?.id === "marionette") &&
                (!s.charadeRole || s.charadeRole.type !== "townsfolk")
            );
            const hasFortuneTeller = seats.some(
              (s) => s.role?.id === "fortune_teller" && !s.isDead
            );
            const hasRedHerring = seats.some((s) => s.isRedHerring);
            const needsRedHerring = hasFortuneTeller && !hasRedHerring;
            const isDisabled = seatedCount < 5 || !hasDemon || hasPendingCharade || needsRedHerring;
            return (
              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (seatedCount < 5) {
                      showAlert(`当前仅有 ${seatedCount} 名玩家分配了角色，最少需 5 人才能开局。`);
                      return;
                    }
                    if (!hasDemon) {
                      showAlert("当前阵容缺少恶魔（或军团）角色，无法开始游戏。");
                      return;
                    }
                    onStartNight(true);
                  }}
                  disabled={isDisabled}
                  className="w-full py-3 bg-green-600 rounded-xl font-bold text-base shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {seatedCount < 5
                    ? `落座人数不足 (${seatedCount}/5)`
                    : !hasDemon
                    ? "缺少恶魔角色 ⚠️"
                    : "确认无误，入夜"}
                </button>
                {seatedCount < 5 && (
                  <div className="text-center text-amber-300 text-sm font-semibold">
                    请先返回准备阶段为至少 5 名玩家落座角色。
                  </div>
                )}
                {seatedCount >= 5 && !hasDemon && (
                  <div className="text-center text-rose-300 text-sm font-semibold">
                    场上缺少恶魔角色，请至少分配一名恶魔。
                  </div>
                )}
                {hasPendingCharade && (
                  <div className="text-center text-yellow-300 text-sm font-semibold">
                    场上有酒鬼或提线木偶未选择镇民伪装身份。
                  </div>
                )}
                {needsRedHerring && (
                  <div className="text-center text-yellow-300 text-sm font-semibold">
                    场上有占卜师但未设置红罗刹，请右键点击一个座位选择"选为红罗刹"
                  </div>
                )}
              </div>
            );
          })()}
        {(gamePhase === "firstNight" || gamePhase === "night") && (
          <button
            onClick={onConfirmAction}
            disabled={isConfirmDisabled}
            className="w-full py-3 bg-white text-black rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认 / 下一步
          </button>
        )}
        {gamePhase === "day" && (
          <>
            {evilTwinPair && (
              <div className="w-full mb-2 flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={remainingDays ?? ""}
                  onChange={(e) =>
                    setRemainingDays(
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  placeholder="剩余日间数"
                  className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-center"
                />
                <button
                  onClick={() => {
                    if (remainingDays !== null && remainingDays > 0) {
                      setRemainingDays(remainingDays - 1);
                      onAddLog(`剩余日间数：${remainingDays - 1}`);
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 rounded-lg font-bold"
                  disabled={remainingDays === null || remainingDays <= 0}
                >
                  -1
                </button>
              </div>
            )}
            {cerenovusTarget && (
              <button
                onClick={() => {
                  const target = seats.find(
                    (s) => s.id === cerenovusTarget.targetId
                  );
                  if (target) {
                    onSetShowMadnessCheckModal({
                      targetId: cerenovusTarget.targetId,
                      roleName: cerenovusTarget.roleName,
                      day: nightCount,
                    });
                  }
                }}
                className="w-full mb-2 py-2 bg-purple-600 rounded-xl font-bold text-sm"
              >
                🧠 检查 {cerenovusTarget.targetId + 1}号 是否疯狂扮演{" "}
                {cerenovusTarget.roleName}
              </button>
            )}
            <button
              onClick={onDayEndTransition}
              className="w-full py-3 bg-orange-600 rounded-xl font-bold text-base"
            >
              进入黄昏 (提名)
            </button>
          </>
        )}
        {gamePhase === "dusk" && (
          <>
            <button
              onClick={onExecuteJudgment}
              className="flex-[2] py-3 bg-red-600 rounded-xl font-bold text-lg shadow-lg animate-pulse"
            >
              执行处决
            </button>
            <button
              onClick={() => onStartNight(false)}
              className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold text-sm"
            >
              直接入夜
            </button>
          </>
        )}
        {gamePhase === "dawnReport" && (
          <button
            onClick={() => onSetGamePhase("day")}
            className="w-full py-3 bg-yellow-500 text-black rounded-xl font-bold text-base"
          >
            进入白天
          </button>
        )}
      </div>
    </div>
  );
};
