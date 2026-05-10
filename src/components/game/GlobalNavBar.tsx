"use client";

import { useCallback, useMemo, useState } from "react";
import type { GameState } from "../../contexts/GameContext";
import { gameActions, useGameContext } from "../../contexts/GameContext";
import { useGameState } from "../../hooks/useGameState";
import { useGameActions } from "../../contexts/GameActionsContext";
import { useHistoryController } from "../../hooks/useHistoryController";
import {
  clearCurrentSnapshot,
  createSnapshotFromState,
  generateId,
  loadGameRecords,
  saveGameRecord,
} from "../../utils/persistence";
import { GameRecordsModal } from "../modals/GameRecordsModal";

/**
 * 全局导航栏 - 悬浮在页面右上角
 * 提供：主页、上一步、历史记录、重置 四个按钮
 *
 * "📋 历史"按钮只显示当前剧本的对局记录
 */
export function GlobalNavBar() {
  const { state, dispatch } = useGameContext();
  const { gamePhase, selectedScript, seats, gameLogs, startTime, gameRecords } =
    useGameState();
  const { saveHistory, handleGlobalUndo } = useHistoryController();
  const controller = useGameActions();
  const handleContinueGame = (controller as any).handleContinueGame;
  const [showRecords, setShowRecords] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 筛选当前剧本的对局记录
  const currentScriptRecords = useMemo(() => {
    if (!selectedScript) return gameRecords;
    return gameRecords.filter((r) => r.scriptName === selectedScript.name);
  }, [gameRecords, selectedScript]);

  const handleHome = useCallback(() => {
    // 保存当前状态到历史记录（以便撤销）
    saveHistory();

    // 将当前游戏保存为 in_progress 记录（以便回到主页后继续）
    const now = new Date();
    const currentSeats = JSON.parse(JSON.stringify(seats));
    const safeSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      phase: state.gamePhase,
      nightCount: state.nightCount,
      dayCount: 1,
      description: `返回主页前快照 - ${state.gamePhase}`,
      triggerAction: "home",
      seats: currentSeats,
      gameLogs: JSON.parse(JSON.stringify(gameLogs)),
      winResult: null,
      winReason: null,
      todayExecutedId: state.todayExecutedId,
      nominatedPlayers: [],
      nominatorPlayers: [],
      nominationRecords: { nominators: [], nominees: [] },
      deadThisNight: [...(state.deadThisNight || [])],
      hasUsedGhostVotePlayers: [],
    };

    const record = {
      id: generateId(),
      scriptName: selectedScript?.name || "未知剧本",
      startTime: startTime?.toISOString() || now.toISOString(),
      endTime: now.toISOString(),
      duration: startTime
        ? Math.floor((now.getTime() - new Date(startTime).getTime()) / 1000)
        : 0,
      winResult: null,
      winReason: null,
      seats: currentSeats,
      gameLogs: [...gameLogs],
      isCompleted: false,
      status: "in_progress",
      snapshot: safeSnapshot,
    } as any;
    saveGameRecord(record);

    // 更新 state 中的 gameRecords
    const updatedRecords = loadGameRecords();
    dispatch(gameActions.setGameRecords(updatedRecords));

    dispatch(gameActions.setGamePhase("scriptSelection"));
  }, [saveHistory, dispatch, state, selectedScript, seats, gameLogs, startTime]);

  const handleUndo = useCallback(() => {
    handleGlobalUndo();
  }, [handleGlobalUndo]);

  const handleShowRecords = useCallback(() => {
    setShowRecords(true);
  }, []);

  const handleReset = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const confirmReset = useCallback(() => {
    // 将当前游戏保存到历史记录
    const now = new Date();

    // 先保存当前 seats 的副本，用于快照
    const currentSeats = JSON.parse(JSON.stringify(seats));

    // 手动构建可序列化的快照（避免 Set 等不可序列化类型）
    const safeSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      phase: state.gamePhase,
      nightCount: state.nightCount,
      dayCount: 1,
      description: `重置前快照 - ${state.gamePhase}`,
      triggerAction: "reset",
      seats: currentSeats,
      gameLogs: JSON.parse(JSON.stringify(gameLogs)),
      winResult: null,
      winReason: null,
      todayExecutedId: state.todayExecutedId,
      nominatedPlayers: [],
      nominatorPlayers: [],
      nominationRecords: { nominators: [], nominees: [] },
      deadThisNight: [...(state.deadThisNight || [])],
      hasUsedGhostVotePlayers: [],
    };

    const record = {
      id: generateId(),
      scriptName: selectedScript?.name || "未知剧本",
      startTime: startTime?.toISOString() || now.toISOString(),
      endTime: now.toISOString(),
      duration: startTime
        ? Math.floor((now.getTime() - new Date(startTime).getTime()) / 1000)
        : 0,
      winResult: null,
      winReason: "游戏重置",
      seats: currentSeats,
      gameLogs: [...gameLogs],
      isCompleted: false,
      snapshot: safeSnapshot,
    } as any;
    saveGameRecord(record);

    // 更新 state 中的 gameRecords（从 localStorage 重新加载）
    const updatedRecords = loadGameRecords();
    dispatch(gameActions.setGameRecords(updatedRecords));

    // 清除当前快照
    clearCurrentSnapshot();

    // 重置游戏状态到初始值，保留当前剧本，回到 setup 阶段（空座位等待落座）
    dispatch(
      gameActions.updateState({
        gamePhase: "setup",
        nightCount: 1,
        executedPlayerId: null,
        wakeQueueIds: [],
        currentWakeIndex: 0,
        selectedActionTargets: [],
        gameLogs: [],
        winResult: null,
        winReason: null,
        deadThisNight: [],
        selectedRole: null,
        inspectionResult: null,
        currentHint: { isPoisoned: false, guide: "", speak: "" },
        timer: 0,
        startTime: null,
        history: [],
        initialSeats: [],
        victorySnapshot: [],
        seats: [],
      })
    );
    setShowResetConfirm(false);
  }, [state, selectedScript, seats, gameLogs, startTime, dispatch]);

  const cancelReset = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  // 只在非 scriptSelection 阶段显示导航按钮
  // 使用 CSS 隐藏而非提前 return，避免违反 React Hooks 规则
  if (gamePhase === "scriptSelection") {
    return (
      <>
        {/* 重置确认弹窗 */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-3">确认重置</h3>
              <p className="text-sm text-gray-300 mb-2">
                当前游戏进程将被保存到历史记录中，然后重新开始一局新游戏。
              </p>
              <p className="text-sm text-yellow-400 mb-4">
                你可以在历史记录中继续未完成的游戏。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelReset}
                  className="flex-1 py-2.5 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition"
                >
                  取消
                </button>
                <button
                  onClick={confirmReset}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
                >
                  确认重置
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 历史记录弹窗（scriptSelection 阶段，显示所有记录） */}
        {showRecords && (
          <GameRecordsModal
            isOpen={true}
            onClose={() => setShowRecords(false)}
            gameRecords={gameRecords}
            isPortrait={false}
            onContinue={handleContinueGame}
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-3">确认重置</h3>
            <p className="text-sm text-gray-300 mb-2">
              当前游戏进程将被保存到历史记录中，然后重新开始一局新游戏。
            </p>
            <p className="text-sm text-yellow-400 mb-4">
              你可以在历史记录中继续未完成的游戏。
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelReset}
                className="flex-1 py-2.5 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition"
              >
                取消
              </button>
              <button
                onClick={confirmReset}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录弹窗（游戏内，只显示当前剧本的记录） */}
      {showRecords && (
        <GameRecordsModal
          isOpen={true}
          onClose={() => setShowRecords(false)}
          gameRecords={currentScriptRecords}
          isPortrait={false}
          onContinue={handleContinueGame}
        />
      )}

      {/* 全局导航按钮 - 悬浮在右上角 */}
      <div className="fixed top-3 right-3 z-[9999] flex gap-2">
        {/* 主页按钮 */}
        <button
          onClick={handleHome}
          className="px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 text-white text-xs font-medium rounded-lg border border-slate-600/50 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 shadow-lg"
          title="返回主页（游戏进程保留）"
        >
          🏠 主页
        </button>

        {/* 上一步/撤销按钮 */}
        <button
          onClick={handleUndo}
          className="px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 text-white text-xs font-medium rounded-lg border border-slate-600/50 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 shadow-lg"
          title="撤销上一步操作"
        >
          ↩ 上一步
        </button>

        {/* 历史记录按钮 */}
        <button
          onClick={handleShowRecords}
          className="px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 text-white text-xs font-medium rounded-lg border border-slate-600/50 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 shadow-lg"
          title="查看历史记录"
        >
          📋 历史
        </button>

        {/* 重置按钮 */}
        <button
          onClick={handleReset}
          className="px-3 py-2 bg-red-900/80 hover:bg-red-800/80 text-white text-xs font-medium rounded-lg border border-red-700/50 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 shadow-lg"
          title="重开一局（当前游戏保存到历史记录）"
        >
          🔄 重置
        </button>
      </div>
    </>
  );
}
