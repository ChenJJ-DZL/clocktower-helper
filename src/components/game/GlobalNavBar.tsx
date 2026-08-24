"use client";

import { useCallback, useMemo, useState } from "react";
import { useGameActions } from "../../contexts/GameActionsContext";
import type { GameState } from "../../contexts/GameContext";
import { gameActions, useGameContext } from "../../contexts/GameContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useGameState } from "../../hooks/useGameState";
import { useHistoryController } from "../../hooks/useHistoryController";
import {
  clearCurrentSnapshot,
  createSnapshotFromState,
  generateId,
  loadGameRecords,
  saveGameRecord,
} from "../../utils/persistence";
import { GameRecordsModal } from "../modals/GameRecordsModal";
import { ModalWrapper } from "../modals/ModalWrapper";

/**
 * 全局导航栏 - 悬浮在页面右上角
 * 提供：主页、上一步、历史记录、重置 四个按钮
 *
 * "📋 历史"按钮只显示当前剧本的对局记录
 */
export function GlobalNavBar() {
  const { theme, requestTheme } = useTheme();
  const { state, dispatch } = useGameContext();
  const { gamePhase, selectedScript, seats, gameLogs, startTime, gameRecords } =
    useGameState();
  const { saveHistory, handleGlobalUndo, handleRedo, canUndo, canRedo } =
    useHistoryController();
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
  }, [
    saveHistory,
    dispatch,
    state,
    selectedScript,
    seats,
    gameLogs,
    startTime,
  ]);

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
          <ModalWrapper
            title="🔄 确认重置"
            onClose={cancelReset}
            className="max-w-md"
            footer={
              <div className="flex gap-3 justify-end w-full">
                <button
                  onClick={cancelReset}
                  className="px-6 py-2.5 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition"
                >
                  取消
                </button>
                <button
                  onClick={confirmReset}
                  className="px-6 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
                >
                  确认重置
                </button>
              </div>
            }
          >
            <div className="space-y-3 py-2 text-center">
              <p className="text-base text-gray-200">
                当前游戏进程将被保存到历史记录中，然后重新开始一局新游戏。
              </p>
              <p className="text-sm text-yellow-400 font-medium">
                你可以在历史记录中随时继续未完成的游戏。
              </p>
            </div>
          </ModalWrapper>
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
        <ModalWrapper
          title="🔄 确认重置"
          onClose={cancelReset}
          className="max-w-md"
          footer={
            <div className="flex gap-3 justify-end w-full">
              <button
                onClick={cancelReset}
                className="px-6 py-2.5 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition"
              >
                取消
              </button>
              <button
                onClick={confirmReset}
                className="px-6 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
              >
                确认重置
              </button>
            </div>
          }
        >
          <div className="space-y-3 py-2 text-center">
            <p className="text-base text-gray-200">
              当前游戏进程将被保存到历史记录中，然后重新开始一局新游戏。
            </p>
            <p className="text-sm text-yellow-400 font-medium">
              你可以在历史记录中随时继续未完成的游戏。
            </p>
          </div>
        </ModalWrapper>
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

      {/* 全局导航按钮 - 内联工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
        {/* 左侧：主题切换胶囊 */}
        <div className="flex items-center">
          <div className="flex items-center rounded-full border p-0.5 transition-all duration-300 bg-slate-900/80 border-white/10 theme-modern:border-amber-500/20 theme-modern:shadow-[0_0_16px_rgba(245,158,11,0.15)]">
            <button
              onClick={() => requestTheme("classic")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 active:scale-95 cursor-pointer ${
                theme === "classic"
                  ? "bg-amber-600 text-white font-bold shadow-md shadow-amber-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="🏛️ 官方原版经典皮肤 (默认)"
            >
              🏛️ 经典
            </button>
            <button
              onClick={() => requestTheme("modern")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 active:scale-95 cursor-pointer ${
                theme === "modern"
                  ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="✨ 现代暗黑版 (开发中，连续点击8次开启)"
            >
              ✨ 现代
            </button>
          </div>
        </div>

        {/* 左侧：主页 + 撤销/重做 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleHome}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg border border-slate-600/50 transition-all active:scale-95"
            title="返回主页（游戏进程保留）"
          >
            🏠 主页
          </button>

          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all active:scale-95 ${
              canUndo
                ? "bg-slate-800 hover:bg-slate-700 text-white border-slate-600/50"
                : "bg-slate-800/40 text-slate-500 border-slate-700/30 cursor-not-allowed"
            }`}
            title="撤销上一步操作"
          >
            ↩ 撤销
          </button>

          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all active:scale-95 ${
              canRedo
                ? "bg-slate-800 hover:bg-slate-700 text-white border-slate-600/50"
                : "bg-slate-800/40 text-slate-500 border-slate-700/30 cursor-not-allowed"
            }`}
            title="重做被撤销的操作"
          >
            ↪ 重做
          </button>
        </div>

        {/* 右侧：历史、复盘、重置 */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleShowRecords}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg border border-slate-600/50 transition-all active:scale-95"
            title="查看历史记录"
          >
            📋 历史
          </button>

          <button
            onClick={() =>
              controller.setCurrentModal({ type: "REVIEW", data: null })
            }
            className="px-3 py-1.5 bg-indigo-800/90 hover:bg-indigo-700/90 text-white text-xs font-medium rounded-lg border border-indigo-600/50 transition-all active:scale-95"
            title="查看本局复盘"
          >
            📜 复盘
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-red-900/80 hover:bg-red-800/80 text-white text-xs font-medium rounded-lg border border-red-700/50 transition-all active:scale-95"
            title="重开一局（当前游戏保存到历史记录）"
          >
            🔄 重置
          </button>

          <span className="text-[10px] text-slate-500 font-mono select-none px-1">
            W8.23.2
          </span>
        </div>
      </div>
    </>
  );
}
