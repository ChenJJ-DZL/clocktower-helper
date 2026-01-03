"use client";

import React from "react";
import type { Seat, GamePhase } from "@/app/data";

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
  onPreStartNight: () => void;
  onStartNight: (isFirst: boolean) => void;
  onStepBack: () => void;
  onConfirmAction: () => void;
  onDayEndTransition: () => void;
  onExecuteJudgment: () => void;
  onSetGamePhase: (phase: GamePhase) => void;
  onSetShowMadnessCheckModal: (modal: { targetId: number; roleName: string; day: number } | null) => void;
  onAddLog: (msg: string) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  gamePhase,
  seats,
  currentWakeIndex,
  history,
  isConfirmDisabled,
  evilTwinPair,
  remainingDays,
  setRemainingDays,
  cerenovusTarget,
  nightCount,
  onPreStartNight,
  onStartNight,
  onStepBack,
  onConfirmAction,
  onDayEndTransition,
  onExecuteJudgment,
  onSetGamePhase,
  onSetShowMadnessCheckModal,
  onAddLog,
}) => {
  return (
    <div className="w-full p-4 flex gap-3 justify-center">
      {gamePhase === 'setup' && (
        <button
          onClick={onPreStartNight}
          className="w-full py-3 bg-indigo-600 rounded-xl font-bold text-base shadow-xl"
        >
          开始游戏 (首夜)
        </button>
      )}
      {gamePhase === 'check' && (() => {
        // 酒鬼必须先分配镇民伪装身份，未分配或分配非镇民时禁止入夜
        const hasPendingDrunk = seats.some(s => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
        return (
          <div className="w-full flex flex-col gap-2">
            <button
              onClick={() => !hasPendingDrunk && onStartNight(true)}
              disabled={hasPendingDrunk}
              className="w-full py-3 bg-green-600 rounded-xl font-bold text-base shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认无误，入夜
            </button>
            {hasPendingDrunk && (
              <div className="text-center text-yellow-300 text-sm font-semibold">
                场上有酒鬼未选择镇民伪装身份，请长按其座位分配后再入夜
              </div>
            )}
          </div>
        );
      })()}
      {(gamePhase === 'firstNight' || gamePhase === 'night') && (
        <>
          <button
            onClick={onStepBack}
            className="flex-1 py-3 bg-gray-700 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentWakeIndex === 0 && history.length === 0}
          >
            上一步
          </button>
          <button
            onClick={onConfirmAction}
            disabled={isConfirmDisabled}
            className="flex-[2] py-3 bg-white text-black rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认 / 下一步
          </button>
        </>
      )}
      {gamePhase === 'day' && (
        <>
          {/* 剩余日间按钮（evil_twin 相关） */}
          {evilTwinPair && (
            <div className="w-full mb-2 flex gap-2">
              <input
                type="number"
                min="0"
                value={remainingDays ?? ''}
                onChange={(e) => setRemainingDays(e.target.value ? parseInt(e.target.value) : null)}
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
          {/* 疯狂判定按钮（洗脑师相关） */}
          {cerenovusTarget && (
            <button
              onClick={() => {
                const target = seats.find(s => s.id === cerenovusTarget.targetId);
                if (target) {
                  onSetShowMadnessCheckModal({
                    targetId: cerenovusTarget.targetId,
                    roleName: cerenovusTarget.roleName,
                    day: nightCount
                  });
                }
              }}
              className="w-full mb-2 py-2 bg-purple-600 rounded-xl font-bold text-sm"
            >
              🧠 检查 {cerenovusTarget.targetId + 1}号 是否疯狂扮演 {cerenovusTarget.roleName}
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
      {gamePhase === 'dusk' && (
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
      {gamePhase === 'dawnReport' && (
        <button
          onClick={() => onSetGamePhase('day')}
          className="w-full py-3 bg-yellow-500 text-black rounded-xl font-bold text-base"
        >
          进入白天
        </button>
      )}
    </div>
  );
};

