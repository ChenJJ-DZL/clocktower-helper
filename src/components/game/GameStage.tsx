"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { roles, type Role, type Seat, typeLabels, typeColors, typeBgColors } from "../../../app/data";
import { GameHeader } from "./info/GameHeader";
import { LogViewer } from "./info/LogViewer";
import { ControlPanel } from "../ControlPanel";
import { GameModals } from "./GameModals";
import { SeatGrid } from "./board/SeatGrid";
import { RoundTable } from "./board/RoundTable";
import { GameConsole } from "./console/GameConsole";
import { getSeatPosition } from "../../utils/gameRules";
import { GameLayout } from "./GameLayout";
import { ScaleToFit } from "./board/ScaleToFit";
import { setAntagonismGlobalOverride } from "../../utils/antagonism";
import { getStorytellerTips } from "../../utils/storytellerTips";

// 全量重写的 GameStage 组件
export function GameStage({ controller }: { controller: any }) {
  // 从控制器获取所需的状态与方法
  const {
    // 状态
    seats,
    gamePhase,
    selectedScript,
    nightCount,
    deadThisNight,
    timer,
    selectedActionTargets,
    nightInfo,
    isPortrait,
    longPressingSeats,
    contextMenu,
    showMenu,
    currentWakeIndex,
    wakeQueueIds,
    inspectionResult,
    inspectionResultKey,
    currentHint,
    history,
    evilTwinPair,
    remainingDays,
    setRemainingDays,
    cerenovusTarget,
    dayAbilityLogs,
    damselGuessed,
    shamanKeyword,
    shamanTriggered,
    showMinionKnowDemonModal,
    setShowMinionKnowDemonModal,
    autoRedHerringInfo,
    selectedRole,
    setSelectedRole,
    
    // refs
    seatContainerRef,
    seatRefs,
    fakeInspectionResultRef,
    consoleContentRef,
    currentActionTextRef,
    longPressTimerRef,
    longPressTriggeredRef,
    checkLongPressTimerRef,
    
    // setters
    currentModal,
    setCurrentModal,
    setContextMenu,
    setShowMenu,
    setSelectedActionTargets,
    setInspectionResult,
    setCurrentWakeIndex,
    setShowNightDeathReportModal,
    setShowDrunkModal,
    setShowDamselGuessModal,
    setShowShamanConvertModal,
    setShowDayActionModal,
    setShowGameRecordsModal,
    setShowReviewModal,
    setShowRoleInfoModal,
    setSeats,
    setGamePhase,
    setShowSpyDisguiseModal,
    
    // 方法
    saveHistory,
    hasUsedAbility,
    hasUsedDailyAbility,
    getSeatRoleId,
    formatTimer,
    getDisplayRoleType,
    isActionAbility,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    onSeatClick,
    toggleStatus,
    handlePreStartNight,
    handleStepBack,
    handleConfirmAction,
    handleDayEndTransition,
    executeJudgment,
    addLog,
    handleDayAbilityTrigger,
    handleSwitchScript,
    handleRestart,
    handleGlobalUndo,
    nightLogic,
    getSeatPosition,
    toggleTarget,
    isTargetDisabled,
    executePlayer,
    isGoodAlignment,
    groupedRoles,
    setLongPressingSeats,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    executeNomination,
    checkGameOverSimple,
    registerVotes,
    votedThisRound,
    
    // Modal states for isConfirmDisabled check
    showKillConfirmModal,
    showPoisonConfirmModal,
    showPoisonEvilConfirmModal,
    showHadesiaKillConfirmModal,
    showRavenkeeperFakeModal,
    showMoonchildKillModal,
    showBarberSwapModal,
    showStorytellerDeathModal,
    showSweetheartDrunkModal,
    showKlutzChoiceModal,
    showPitHagModal,
  } = controller;

  // 计算左侧面板的缩放比例，使座位表适应容器
  const [seatScale, setSeatScale] = useState(1);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [antagonismEnabled, setAntagonismEnabled] = useState<boolean>(false); // 相克规则开关（默认关闭）

  useEffect(() => {
    // 同步到全局规则层；null 表示按灯神检测，这里明确使用布尔值
    setAntagonismGlobalOverride(antagonismEnabled);
  }, [antagonismEnabled]);
  
  // Dusk Phase: Nomination state
  const [nominator, setNominator] = useState<number | null>(null);
  const [nominee, setNominee] = useState<number | null>(null);
  const [pendingVoteFor, setPendingVoteFor] = useState<number | null>(null);
  const [defenseSecondsLeft, setDefenseSecondsLeft] = useState<number>(0);
  const defenseTimerRef = useRef<number | null>(null);
  const [lastCallSecondsLeft, setLastCallSecondsLeft] = useState<number>(0);
  const lastCallTimerRef = useRef<number | null>(null);
  const lastModalTypeRef = useRef<string | null>(null);
  const [isNominationLocked, setIsNominationLocked] = useState<boolean>(false);
  const aliveCoreCount = useMemo(
    () => seats.filter((s: Seat) => !s.isDead && s.role && s.role.type !== 'traveler').length,
    [seats]
  );
  const voteThreshold = useMemo(() => Math.ceil(aliveCoreCount / 2), [aliveCoreCount]);

  const stopDefenseTimer = useCallback(() => {
    if (defenseTimerRef.current !== null) {
      window.clearInterval(defenseTimerRef.current);
      defenseTimerRef.current = null;
    }
  }, []);

  const stopLastCallTimer = useCallback(() => {
    if (lastCallTimerRef.current !== null) {
      window.clearInterval(lastCallTimerRef.current);
      lastCallTimerRef.current = null;
    }
  }, []);

  const startLastCall = useCallback((seconds: number) => {
    stopLastCallTimer();
    setIsNominationLocked(false);
    setLastCallSecondsLeft(seconds);
    lastCallTimerRef.current = window.setInterval(() => {
      setLastCallSecondsLeft(prev => {
        if (prev <= 1) {
          stopLastCallTimer();
          setIsNominationLocked(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopLastCallTimer]);

  const startDefenseTimer = useCallback((seconds: number) => {
    stopDefenseTimer();
    setDefenseSecondsLeft(seconds);
    defenseTimerRef.current = window.setInterval(() => {
      setDefenseSecondsLeft(prev => {
        if (prev <= 1) {
          stopDefenseTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopDefenseTimer]);

  useEffect(() => {
    return () => {
      stopDefenseTimer();
      stopLastCallTimer();
    };
  }, [stopDefenseTimer, stopLastCallTimer]);

  // 每次进入黄昏阶段时，重置本地黄昏状态，避免历史遗留状态导致按钮长时间不可用
  useEffect(() => {
    if (gamePhase === 'dusk') {
      console.log('[GameStage] 进入黄昏阶段，重置所有黄昏状态');
      stopDefenseTimer();
      stopLastCallTimer();
      setNominator(null);
      setNominee(null);
      setPendingVoteFor(null);
      setDefenseSecondsLeft(0);
      setLastCallSecondsLeft(0);
      setIsNominationLocked(false);
    }
  }, [gamePhase]); // 简化依赖项，只在 gamePhase 变化时执行

  // 监听投票模态框关闭（仅当曾经打开过 VOTE_INPUT 时才清除）
  useEffect(() => {
    const prevType = lastModalTypeRef.current;
    const currType = currentModal?.type ?? null;
    if (gamePhase === 'dusk' && prevType === 'VOTE_INPUT' && currType === null && pendingVoteFor !== null) {
      console.log('[GameStage] 投票模态关闭，清除 pendingVoteFor，允许下一次提名');
      setPendingVoteFor(null);
    }
    lastModalTypeRef.current = currType;
  }, [gamePhase, currentModal, pendingVoteFor]);
  
  useEffect(() => {
    const updateSeatScale = () => {
      if (!leftPanelRef.current) return;
      const container = leftPanelRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      // 使用一个合理的基准尺寸来计算缩放
      const baseSize = Math.min(containerWidth, containerHeight) * 0.8;
      const scale = Math.min(1, baseSize / 800); // 800px 作为基准
      setSeatScale(scale);
    };
    updateSeatScale();
    window.addEventListener("resize", updateSeatScale);
    return () => window.removeEventListener("resize", updateSeatScale);
  }, []);

  // 供控制台 / ControlPanel 使用的禁用逻辑
  const isConfirmDisabled = useMemo(() => {
    // CRITICAL FIX: In check phase, button is only disabled if drunk needs charade role
    if (gamePhase === 'check') {
      const hasPendingDrunk = seats.some((s: Seat) => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
      return hasPendingDrunk;
    }
    
    // For night phases, must have nightInfo
    if (!nightInfo) return true;
    
    // CRITICAL FIX: Disable button if there are pending confirmation modals
    // This prevents users from clicking "Next" when they need to confirm an action first
    // EXCEPTION: For poisoner, if modal is set but not visible, allow bypass after 2 seconds
    const hasPendingModals = 
      showKillConfirmModal !== null ||
      (showPoisonConfirmModal !== null) ||
      showPoisonEvilConfirmModal !== null ||
      showHadesiaKillConfirmModal !== null ||
      showRavenkeeperFakeModal !== null ||
      showMoonchildKillModal !== null ||
      showBarberSwapModal !== null ||
      showStorytellerDeathModal !== null ||
      showSweetheartDrunkModal !== null ||
      showKlutzChoiceModal !== null ||
      showPitHagModal !== null;
    
    // 重构：移除 DOM 检测逻辑，直接检查状态
    // 如果有待确认的弹窗，禁用确认按钮
    if (hasPendingModals) {
      return true;
    }
    
    return false;
  }, [
    gamePhase,
    seats,
    nightInfo,
    showKillConfirmModal,
    showPoisonConfirmModal,
    showPoisonEvilConfirmModal,
    showHadesiaKillConfirmModal,
    showRavenkeeperFakeModal,
    showMoonchildKillModal,
    showBarberSwapModal,
    showStorytellerDeathModal,
    showSweetheartDrunkModal,
    showKlutzChoiceModal,
    showPitHagModal,
  ]);

  // 统一的说书人指引（夜晚脚本提示 + 阶段小操作提示）
  const guidancePoints = useMemo(() => {
    const base: string[] =
      (gamePhase === "firstNight" || gamePhase === "night") && nightInfo?.guide
        ? [nightInfo.guide]
        : [];
    const extra = getStorytellerTips({
      gamePhase,
      seats,
      nightCount,
      deadThisNight,
      isGoodAlignment,
    });
    const merged: string[] = [];
    const seen = new Set<string>();
    [...base, ...extra].forEach((t) => {
      if (!seen.has(t)) {
        seen.add(t);
        merged.push(t);
      }
    });
    return merged;
  }, [gamePhase, nightInfo?.guide, seats, nightCount, deadThisNight, isGoodAlignment]);

  // 当前/下一个行动角色信息
  const currentWakeSeat = nightInfo ? seats.find((s: Seat) => s.id === nightInfo.seat.id) : null;
  const nextWakeSeatId =
    (gamePhase === "firstNight" || gamePhase === "night") && currentWakeIndex + 1 < wakeQueueIds.length
      ? wakeQueueIds[currentWakeIndex + 1]
      : null;
  const nextWakeSeat = nextWakeSeatId !== null ? seats.find((s: Seat) => s.id === nextWakeSeatId) : null;
  const getDisplayRole = (seat: Seat | null | undefined) => {
    if (!seat) return null;
    const base = seat.role?.id === "drunk" ? seat.charadeRole : seat.role;
    return base;
  };
  const currentWakeRole = getDisplayRole(currentWakeSeat);
  const nextWakeRole = getDisplayRole(nextWakeSeat);

  // Handle Dusk Phase UI
  if (gamePhase === 'dusk') {
    return (
      <div className="w-full h-full flex flex-col bg-slate-950">
        {/* Layout: Left Table, Right Controls */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Round Table */}
          <div className="flex-1 bg-slate-950 relative flex items-center justify-center">
            {/* 相克规则开关（左上角，小按钮） */}
            <button
              type="button"
              onClick={() => setAntagonismEnabled((v) => !v)}
              className="absolute top-3 left-3 z-40 px-2 py-1 text-xs rounded-md border border-white/20 bg-slate-800/80 text-white shadow-sm hover:bg-slate-700/80"
              title="相克规则开关（默认关闭，不产生影响）"
            >
              相克规则：{antagonismEnabled ? '开' : '关'}
            </button>
            <ScaleToFit>
              <RoundTable
                seats={seats}
                nightInfo={null}
                selectedActionTargets={[]}
                isPortrait={isPortrait}
                longPressingSeats={new Set()}
                nominator={nominator}
                nominee={nominee}
                onSeatClick={(seat) => {
                  // Simple toggle logic for UI
                  if (nominator === null) {
                    setNominator(seat.id);
                  } else if (nominee === null && seat.id !== nominator) {
                    setNominee(seat.id);
                  } else {
                    setNominator(seat.id);
                    setNominee(null);
                  }
                }}
                onContextMenu={(e, seatId) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, seatId });
                }}
                onTouchStart={(e, seatId) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (nominator === null) {
                    setNominator(seatId);
                  } else if (nominee === null && seatId !== nominator) {
                    setNominee(seatId);
                  } else {
                    setNominator(seatId);
                    setNominee(null);
                  }
                }}
                onTouchEnd={(e, seatId) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onTouchMove={(e, seatId) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                setSeatRef={(id, el) => {
                  seatRefs.current[id] = el;
                }}
                getDisplayRoleType={getDisplayRoleType}
                typeColors={typeColors}
                gamePhase={gamePhase}
                nightCount={nightCount}
                timer={timer}
                formatTimer={formatTimer}
                onTimerStart={controller.handleTimerStart}
                onTimerPause={controller.handleTimerPause}
                onTimerReset={controller.handleTimerReset}
              />
            </ScaleToFit>
            
            {/* Overlay Instruction */}
            <div className="absolute top-4 left-0 right-0 text-center text-orange-500 font-bold text-lg drop-shadow-lg z-30">
              {nominator === null 
                ? "点击选择 提名者" 
                : (nominee === null 
                  ? `已选择提名者: ${nominator + 1}号，点击选择 被提名者` 
                  : `准备提名: ${nominator + 1}号 → ${nominee + 1}号`)}
            </div>
          </div>

          {/* Right: Dusk Control Panel */}
          <div className="w-[450px] bg-slate-900 border-l border-white/10 flex flex-col p-6 gap-4 overflow-y-auto relative z-40">
            <h2 className="text-2xl font-black text-orange-500 uppercase tracking-wide">⚖️ 处决台</h2>

            {/* Last Call */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-2 border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">最后一次提名:</span>
                <span className="font-bold text-white">不限时（由说书人手动控制）</span>
              </div>
              <div className="text-xs text-gray-400 leading-relaxed">
                规则映射：取消倒计时，不自动锁定提名。说书人可随时点击「开始投票」。
              </div>
            </div>
            
            {/* Selection Display */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-2 border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">提名者:</span>
                <span className="text-white font-bold text-lg">
                  {nominator !== null ? `${nominator + 1}号` : '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">被提名者:</span>
                <span className="text-white font-bold text-lg">
                  {nominee !== null ? `${nominee + 1}号` : '-'}
                </span>
              </div>
            </div>

            {/* Storyteller Tips */}
            {guidancePoints.length > 0 && (
              <div className="bg-slate-800 p-4 rounded-lg space-y-2 border border-white/10">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <span>📒</span> 说书人建议
                </h3>
                <div className="space-y-1 text-xs text-gray-200 leading-relaxed">
                  {guidancePoints.map((tip, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <span className="text-amber-400">•</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voting Flow Status */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-2 border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">待投票对象:</span>
                <span className="text-white font-bold">
                  {pendingVoteFor !== null ? `${pendingVoteFor + 1}号` : '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">辩护时间:</span>
                <span className="text-white font-bold">不限时（手动）</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">上台门槛:</span>
                <span className="text-white font-bold">{voteThreshold} 票 （存活非旅行者 {aliveCoreCount}）</span>
              </div>
              <div className="text-xs text-gray-400 leading-relaxed">
                规则映射：提名后先给被提名者短暂辩护时间（建议 10~30s），随后由说书人点击「开始投票」打开举手名单面板。
              </div>
            </div>

            {/* Voting Recorder / 简要提示：投票在弹窗中完成 */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-2 border border-white/10">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>✋</span> 投票与记录
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                点击下方「开始投票」按钮会弹出举手名单面板，自动统计票数、消耗幽灵票，并记录本轮所有投票者（用于卖花女 / 城镇公告员）。
              </p>
              {votedThisRound && votedThisRound.length > 0 && (
                <div className="text-xs text-gray-300">
                  本轮已记录投票者：{votedThisRound.map((id: number) => `${id + 1}号`).join('、')}
                </div>
              )}
            </div>

            {/* Execution Block (Candidates) */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-2 border border-white/10">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>🏛️</span> 处决台（上台者）
              </h3>
              {(() => {
                const candidates: Array<{ id: number; voteCount: number }> = seats
                  .filter((s: Seat) => s.isCandidate)
                  .map((s: Seat) => ({ id: s.id, voteCount: s.voteCount || 0 }))
                  .sort((a: { id: number; voteCount: number }, b: { id: number; voteCount: number }) => b.voteCount - a.voteCount);

                if (candidates.length === 0) {
                  return <div className="text-xs text-gray-400">暂无上台者（未达到半数门槛或尚未投票）</div>;
                }

                const topVotes = candidates[0].voteCount;
                const tops = candidates.filter(c => c.voteCount === topVotes);
                const isTie = tops.length >= 2;

                return (
                  <>
                    <div className="text-xs text-gray-300">
                      当前最高票：<span className="font-bold text-white">{topVotes}</span>
                      {isTie ? <span className="ml-2 text-yellow-300">（平票：{tops.map(t => `${t.id + 1}号`).join('、')}）</span> : null}
                    </div>
                    <div className="space-y-1">
                      {candidates.map(c => (
                        <div
                          key={c.id}
                          className={`flex justify-between text-sm rounded px-2 py-1 border ${
                            c.voteCount === topVotes
                              ? (isTie ? 'border-yellow-500/60 bg-yellow-900/20 text-yellow-100' : 'border-red-500/60 bg-red-900/20 text-red-100')
                              : 'border-white/10 bg-slate-900/40 text-slate-200'
                          }`}
                        >
                          <span>{c.id + 1}号</span>
                          <span className="font-mono font-bold">{c.voteCount}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 leading-relaxed">
                      规则映射：只有处决台上最高票且不平票的玩家会被处决；若最高票平票则平安黄昏无人被处决。
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 relative z-50">
              <button 
                type="button"
                disabled={isNominationLocked}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[GameStage] 点击发起提名按钮', { nominator, nominee, isNominationLocked, pendingVoteFor, executeNomination: typeof executeNomination });
                  try {
                    // 移除 pendingVoteFor 检查，允许在投票完成后立即进行下一次提名
                    // 投票完成后会自动清除 pendingVoteFor
                    if (nominator === null || nominee === null) {
                      alert('请先在圆桌上依次点击"提名者"和"被提名者"。');
                      return;
                    }
                    if (typeof executeNomination !== 'function') {
                      console.error('[GameStage] executeNomination is not a function:', executeNomination);
                      alert('错误：executeNomination 函数不可用，请刷新页面重试。');
                      return;
                    }
                    // Call executeNomination (which handles Virgin trigger from Step 4)
                    executeNomination(nominator, nominee, { openVoteModal: false });
                    addLog(`📣 ${nominator + 1}号 提名了 ${nominee + 1}号`);
                    setPendingVoteFor(nominee);
                    // 取消自动辩护倒计时，由说书人手动控制节奏
                    // Reset selection
                    setNominator(null);
                    setNominee(null);
                  } catch (error) {
                    console.error('[GameStage] 发起提名时出错:', error);
                    alert(`发起提名时出错: ${error instanceof Error ? error.message : String(error)}`);
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                className="p-4 bg-orange-600/20 text-orange-500 border border-orange-600/50 rounded-lg hover:bg-orange-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold cursor-pointer relative z-50"
                style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                📣 发起提名 (触发技能检测)
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[GameStage] 点击开始投票按钮', { pendingVoteFor, setCurrentModal: typeof setCurrentModal });
                  try {
                    if (pendingVoteFor === null) {
                      alert('当前没有待投票的被提名者，请先发起一次有效提名。');
                      return;
                    }
                    if (typeof setCurrentModal !== 'function') {
                      console.error('[GameStage] setCurrentModal is not a function:', setCurrentModal);
                      alert('错误：setCurrentModal 函数不可用，请刷新页面重试。');
                      return;
                    }
                    stopDefenseTimer();
                    setDefenseSecondsLeft(0);
                    setCurrentModal({ type: 'VOTE_INPUT', data: { voterId: pendingVoteFor } });
                  } catch (error) {
                    console.error('[GameStage] 开始投票时出错:', error);
                    alert(`开始投票时出错: ${error instanceof Error ? error.message : String(error)}`);
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                className="p-4 bg-blue-600/20 text-blue-200 border border-blue-500/40 rounded-lg hover:bg-blue-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold cursor-pointer relative z-50"
                style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                🗳️ 开始投票（打开举手名单面板）
              </button>
              
              <div className="h-px bg-white/10 my-2"></div>

              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[GameStage] 点击执行处决按钮', { executeJudgment: typeof executeJudgment });
                  try {
                    if (seats.every((s: Seat) => !s.isCandidate)) {
                      alert('当前处决台为空（无人达成半数门槛），无法执行处决。');
                      return;
                    }
                    if (typeof executeJudgment !== 'function') {
                      console.error('[GameStage] executeJudgment is not a function:', executeJudgment);
                      alert('错误：executeJudgment 函数不可用，请刷新页面重试。');
                      return;
                    }
                    // 直接使用标准处决结算流程（含平票/无人上台/胜负判断）
                    executeJudgment();
                  } catch (error) {
                    console.error('[GameStage] 执行处决时出错:', error);
                    alert(`执行处决时出错: ${error instanceof Error ? error.message : String(error)}`);
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                className="p-4 bg-red-600 text-white font-black rounded-lg text-xl shadow-lg hover:bg-red-500 transition-colors cursor-pointer relative z-50"
                style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                ☠️ 执行处决（根据票数自动结算）
              </button>
            </div>

            <div className="mt-auto pt-4 border-t border-white/10">
              <button 
                onClick={() => {
                  const hasPendingVote = pendingVoteFor !== null;
                  const hasCandidates = seats.some((s: Seat) => s.isCandidate);
                  if (hasPendingVote || hasCandidates) {
                    const ok = confirm("仍有提名/候选未结算，确认直接入夜吗？");
                    if (!ok) return;
                  }
                  if (nightLogic?.startNight) {
                    nightLogic.startNight(false);
                  } else {
                    alert("无法开始夜晚，请检查游戏状态");
                  }
                }}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow hover:bg-indigo-500 transition-colors"
              >
                入夜 (下一回合) 🌙
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <GameLayout
      leftPanel={
        <div className="relative w-full h-full p-4">
          {/* 相克规则开关（左上角，小按钮） */}
          <button
            type="button"
            onClick={() => setAntagonismEnabled((v) => !v)}
            className="absolute top-3 left-3 z-40 px-2 py-1 text-xs rounded-md border border-white/20 bg-slate-800/80 text-white shadow-sm hover:bg-slate-700/80"
            title="相克规则开关（默认关闭，不产生影响）"
          >
            相克规则：{antagonismEnabled ? '开' : '关'}
          </button>
          {/* 夜晚时间线：桌面右上角，单列垂直显示 */}
          {(gamePhase === "firstNight" || gamePhase === "night") && wakeQueueIds.length > 0 && (
            <div className="absolute top-4 right-4 z-20 max-h-[60%] overflow-y-auto flex flex-col gap-2 items-stretch">
              {wakeQueueIds.map((seatId: number, index: number) => {
                const seat = seats.find((s: Seat) => s.id === seatId);
                if (!seat || !seat.role) return null;
                const isCurrent = index === currentWakeIndex;
                return (
                  <div
                    key={seatId}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap shadow ${
                      isCurrent
                        ? "bg-purple-600/90 border-purple-200 text-white shadow-purple-500/40"
                        : "bg-slate-800/80 border-slate-500 text-slate-100"
                    }`}
                  >
                    第{index + 1}步：{seat.id + 1}号【{seat.role.name}】
                  </div>
                );
              })}
            </div>
          )}
          <RoundTable
            seats={seats}
            nightInfo={nightInfo}
            selectedActionTargets={selectedActionTargets}
            isPortrait={isPortrait}
            longPressingSeats={longPressingSeats}
            onSeatClick={(seat) => onSeatClick(seat.id)}
            onContextMenu={(e, seatId) => {
    e.preventDefault(); 
              setContextMenu({ x: e.clientX, y: e.clientY, seatId });
            }}
            onTouchStart={(e, seatId) => {
    e.stopPropagation();
    e.preventDefault();
    const existingTimer = longPressTimerRef.current.get(seatId);
              if (existingTimer) clearTimeout(existingTimer);
              setLongPressingSeats((prev: Set<number>) => new Set(prev).add(seatId));
    longPressTriggeredRef.current.delete(seatId);
    const timer = setTimeout(() => {
                setContextMenu({ x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0, seatId });
      longPressTriggeredRef.current.add(seatId);
      longPressTimerRef.current.delete(seatId);
                setLongPressingSeats((prev: Set<number>) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }, 200);
              longPressTimerRef.current.set(seatId, timer as unknown as number);
            }}
            onTouchEnd={(e, seatId) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
      if (!longPressTriggeredRef.current.has(seatId)) {
        onSeatClick(seatId);
      }
    }
              setLongPressingSeats((prev: Set<number>) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
            }}
            onTouchMove={(e, seatId) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
    }
              setLongPressingSeats((prev: Set<number>) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
            }}
            setSeatRef={(id, el) => {
              seatRefs.current[id] = el;
            }}
                  getDisplayRoleType={getDisplayRoleType}
                  typeColors={typeColors}
                  gamePhase={gamePhase}
                  nightCount={nightCount}
                  timer={timer}
                  formatTimer={formatTimer}
                  onTimerStart={controller.handleTimerStart}
                  onTimerPause={controller.handleTimerPause}
                  onTimerReset={controller.handleTimerReset}
                />
        </div>
      }
      rightPanel={
        <GameConsole
                    gamePhase={gamePhase}
          nightCount={nightCount}
          currentStep={currentWakeIndex + 1}
          totalSteps={wakeQueueIds.length}
          wakeQueueIds={wakeQueueIds}
          scriptText={nightInfo?.speak || (gamePhase === 'day' ? '白天讨论阶段' : gamePhase === 'dusk' ? '黄昏处决阶段' : undefined)}
          guidancePoints={guidancePoints}
          selectedPlayers={selectedActionTargets}
                    seats={seats}
          nightInfo={nightInfo}
          inspectionResult={inspectionResult}
          inspectionResultKey={inspectionResultKey}
          onTogglePlayer={toggleTarget}
          handleDayAbility={controller.handleDayAbility}
          primaryAction={
            (gamePhase === 'firstNight' || gamePhase === 'night')
              ? (() => {
                  // CRITICAL FIX: Handle empty wake queue or last step
                  const isEmpty = wakeQueueIds.length === 0;
                  const isLastStep = !isEmpty && currentWakeIndex >= wakeQueueIds.length - 1;
                  
                  if (isEmpty || isLastStep) {
                    // Explicit "Enter Day" button for empty queue or dawn step
                    return {
                      label: '🌞 天亮了 - 进入白天',
                      onClick: () => {
                        console.log("🌞 [UI] Manual override to Day - Empty queue or dawn step");
                        // Call continueToNextAction which will show death report and transition
                        controller.continueToNextAction();
                      },
                      disabled: false,
                      variant: 'warning' as const,
                    };
                  }
                  
                  // Normal "Next" button for night steps
                  return {
                    label: '确认 & 下一步',
                    onClick: handleConfirmAction,
                    disabled: isConfirmDisabled,
                    variant: 'primary' as const,
                  };
                })()
              : gamePhase === 'check'
              ? {
                  label: '确认无误，入夜 🌙',
                  onClick: () => {
                    console.log("🖱️ [UI] User clicked 'Enter Night'");
                    // Check for pending drunk first
                    const hasPendingDrunk = seats.some((s: Seat) => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
                    if (hasPendingDrunk) {
                      alert('场上有酒鬼未选择镇民伪装身份，请长按其座位分配后再入夜');
                      return;
                    }
                    // Use the synchronous proceedToFirstNight function
                    if (controller.proceedToFirstNight) {
                      controller.proceedToFirstNight();
                    } else {
                      console.error('[GameStage] proceedToFirstNight not available on controller');
                      alert('游戏状态错误：无法开始夜晚。请刷新页面重试。');
                    }
                  },
                  disabled: isConfirmDisabled, // Use the centralized disabled logic
                  variant: 'success' as const,
                }
              : gamePhase === 'day'
              ? {
                  label: '进入黄昏处决阶段',
                  onClick: () => {
                    console.log('[GameStage] Day phase primary action -> handleDayEndTransition');
                    handleDayEndTransition();
                  },
                  disabled: false,
                  variant: 'primary' as const,
                }
              : undefined
          }
          secondaryActions={
            (gamePhase === 'firstNight' || gamePhase === 'night')
              ? [
                  {
                    label: '上一步',
                    onClick: handleStepBack,
                    disabled: currentWakeIndex === 0 && history.length === 0,
                  },
                ]
              : []
          }
          onForceContinue={() => {
            // 强制继续回调：当队列为空时，直接进入天亮阶段
            console.log('[GameStage] onForceContinue called - forcing transition to day');
            if (controller.continueToNextAction) {
              controller.continueToNextAction();
            } else {
              // 备用方案：直接设置游戏阶段
              controller.onSetGamePhase?.('dawnReport');
            }
          }}
        />
      }
    />
    {/* Modals rendered outside layout to ensure proper z-index */}
    </>
  );
}

// Keep GameModals outside the return statement
export function GameStageWithModals({ controller }: { controller: any }) {
  return (
    <>
      <GameStage controller={controller} />
      <GameModals
        handleSlayerTargetSelect={controller.handleSlayerTargetSelect}
        showNightOrderModal={controller.showNightOrderModal}
        showExecutionResultModal={controller.showExecutionResultModal}
        showShootResultModal={controller.showShootResultModal}
        showKillConfirmModal={controller.showKillConfirmModal}
        showAttackBlockedModal={controller.showAttackBlockedModal}
        showPitHagModal={controller.showPitHagModal}
        showRangerModal={controller.showRangerModal}
        showDamselGuessModal={controller.showDamselGuessModal}
        showShamanConvertModal={controller.showShamanConvertModal}
        showBarberSwapModal={controller.showBarberSwapModal}
        showHadesiaKillConfirmModal={controller.showHadesiaKillConfirmModal}
        showMayorRedirectModal={controller.showMayorRedirectModal}
        showPoisonConfirmModal={controller.showPoisonConfirmModal}
        showPoisonEvilConfirmModal={controller.showPoisonEvilConfirmModal}
        showNightDeathReportModal={controller.showNightDeathReportModal}
        showRestartConfirmModal={controller.showRestartConfirmModal}
        showSpyDisguiseModal={controller.showSpyDisguiseModal}
        showMayorThreeAliveModal={controller.showMayorThreeAliveModal}
        showDrunkModal={controller.showDrunkModal}
        showVoteInputModal={controller.showVoteInputModal}
        showRoleSelectModal={controller.showRoleSelectModal}
        showMadnessCheckModal={controller.showMadnessCheckModal}
        showDayActionModal={controller.showDayActionModal}
        virginGuideInfo={controller.virginGuideInfo}
        showDayAbilityModal={controller.showDayAbilityModal}
        showSaintExecutionConfirmModal={controller.showSaintExecutionConfirmModal}
        showLunaticRpsModal={controller.showLunaticRpsModal}
        showVirginTriggerModal={controller.showVirginTriggerModal}
        showRavenkeeperFakeModal={controller.showRavenkeeperFakeModal}
        showStorytellerDeathModal={controller.showStorytellerDeathModal}
        showSweetheartDrunkModal={controller.showSweetheartDrunkModal}
        showKlutzChoiceModal={controller.showKlutzChoiceModal}
        showMoonchildKillModal={controller.showMoonchildKillModal}
        showReviewModal={controller.showReviewModal}
        showGameRecordsModal={controller.showGameRecordsModal}
        showRoleInfoModal={controller.showRoleInfoModal}
        contextMenu={controller.contextMenu}
        currentModal={controller.currentModal}
        setCurrentModal={controller.setCurrentModal}
        gamePhase={controller.gamePhase}
        winResult={controller.winResult}
        winReason={controller.winReason}
        deadThisNight={controller.deadThisNight}
        nightOrderPreview={controller.nightOrderPreview}
        nightQueuePreviewTitle={controller.nightQueuePreviewTitle}
        shamanConvertTarget={controller.shamanConvertTarget}
        mayorRedirectTarget={controller.mayorRedirectTarget}
        spyDisguiseMode={controller.spyDisguiseMode}
        spyDisguiseProbability={controller.spyDisguiseProbability}
        klutzChoiceTarget={controller.klutzChoiceTarget}
        voteInputValue={controller.voteInputValue}
        showVoteErrorToast={controller.showVoteErrorToast}
        voteRecords={controller.voteRecords}
        dayAbilityForm={controller.dayAbilityForm}
        damselGuessUsedBy={controller.damselGuessUsedBy}
        hadesiaChoices={controller.hadesiaChoices}
        selectedScript={controller.selectedScript}
        seats={controller.seats}
        roles={roles}
        filteredGroupedRoles={controller.filteredGroupedRoles}
        groupedRoles={controller.groupedRoles}
        gameLogs={controller.gameLogs}
        gameRecords={controller.gameRecords}
        isPortrait={controller.isPortrait}
        nightInfo={controller.nightInfo}
        selectedActionTargets={controller.selectedActionTargets}
        initialSeats={controller.initialSeats}
        nominationRecords={controller.nominationRecords}
        evilTwinPair={controller.evilTwinPair && "evilId" in controller.evilTwinPair ? [controller.evilTwinPair.evilId, controller.evilTwinPair.goodId] : null}
        remainingDays={controller.remainingDays}
        cerenovusTarget={
          controller.cerenovusTarget
            ? typeof controller.cerenovusTarget === "number"
              ? controller.cerenovusTarget
              : controller.cerenovusTarget.targetId
            : null
        }
        nightCount={controller.nightCount}
        currentWakeIndex={controller.currentWakeIndex}
        history={controller.history}
        isConfirmDisabled={controller.isConfirmDisabled}
        closeNightOrderPreview={controller.closeNightOrderPreview}
        confirmNightOrderPreview={controller.confirmNightOrderPreview}
        confirmExecutionResult={controller.confirmExecutionResult}
        confirmShootResult={controller.confirmShootResult}
        confirmKill={controller.confirmKill}
        confirmPoison={controller.confirmPoison}
        confirmPoisonEvil={controller.confirmPoisonEvil}
        confirmNightDeathReport={controller.confirmNightDeathReport}
        confirmRestart={controller.confirmRestart}
        confirmHadesia={controller.confirmHadesia}
        confirmMayorRedirect={controller.confirmMayorRedirect}
        confirmStorytellerDeath={controller.confirmStorytellerDeath}
        confirmSweetheartDrunk={controller.confirmSweetheartDrunk}
        confirmKlutzChoice={controller.confirmKlutzChoice}
        confirmMoonchildKill={controller.confirmMoonchildKill}
        confirmRavenkeeperFake={controller.confirmRavenkeeperFake}
        confirmVirginTrigger={controller.confirmVirginTrigger}
        resolveLunaticRps={controller.resolveLunaticRps}
        confirmSaintExecution={controller.confirmSaintExecution}
        cancelSaintExecution={controller.cancelSaintExecution}
        handleVirginGuideConfirm={controller.handleVirginGuideConfirm}
        handleDayAction={controller.handleDayAction}
        submitVotes={controller.submitVotes}
        confirmDrunkCharade={controller.confirmDrunkCharade}
        handleNewGame={controller.handleNewGame}
        enterDuskPhase={controller.enterDuskPhase}
        declareMayorImmediateWin={controller.declareMayorImmediateWin}
        executePlayer={controller.executePlayer}
        saveHistory={controller.saveHistory}
        markDailyAbilityUsed={controller.markDailyAbilityUsed}
        markAbilityUsed={controller.markAbilityUsed}
        insertIntoWakeQueueAfterCurrent={controller.insertIntoWakeQueueAfterCurrent}
        continueToNextAction={controller.continueToNextAction}
        addLog={controller.addLog}
        checkGameOver={controller.checkGameOver}
        setShowKillConfirmModal={controller.setShowKillConfirmModal}
        setShowPoisonConfirmModal={controller.setShowPoisonConfirmModal}
        setShowPoisonEvilConfirmModal={controller.setShowPoisonEvilConfirmModal}
        setShowHadesiaKillConfirmModal={controller.setShowHadesiaKillConfirmModal}
        setShowRavenkeeperFakeModal={controller.setShowRavenkeeperFakeModal}
        setShowMoonchildKillModal={controller.setShowMoonchildKillModal}
        setShowBarberSwapModal={controller.setShowBarberSwapModal}
        setShowStorytellerDeathModal={controller.setShowStorytellerDeathModal}
        setShowSweetheartDrunkModal={controller.setShowSweetheartDrunkModal}
        setShowKlutzChoiceModal={controller.setShowKlutzChoiceModal}
        setShowPitHagModal={controller.setShowPitHagModal}
        setShowRangerModal={controller.setShowRangerModal}
        setShowDamselGuessModal={controller.setShowDamselGuessModal}
        setShowShamanConvertModal={controller.setShowShamanConvertModal}
        setShowMayorRedirectModal={controller.setShowMayorRedirectModal}
        setShowNightDeathReportModal={controller.setShowNightDeathReportModal}
        setShowRestartConfirmModal={controller.setShowRestartConfirmModal}
        setShowSpyDisguiseModal={controller.setShowSpyDisguiseModal}
        setShowMayorThreeAliveModal={controller.setShowMayorThreeAliveModal}
        setShowDrunkModal={controller.setShowDrunkModal}
        setShowVoteInputModal={controller.setShowVoteInputModal}
        setShowRoleSelectModal={controller.setShowRoleSelectModal}
        setShowMadnessCheckModal={controller.setShowMadnessCheckModal}
        setShowDayActionModal={controller.setShowDayActionModal}
        setVirginGuideInfo={controller.setVirginGuideInfo}
        setShowDayAbilityModal={controller.setShowDayAbilityModal}
        setShowSaintExecutionConfirmModal={controller.setShowSaintExecutionConfirmModal}
        setShowLunaticRpsModal={controller.setShowLunaticRpsModal}
        setShowVirginTriggerModal={controller.setShowVirginTriggerModal}
        setShowReviewModal={controller.setShowReviewModal}
        setShowGameRecordsModal={controller.setShowGameRecordsModal}
        setShowRoleInfoModal={controller.setShowRoleInfoModal}
        setContextMenu={controller.setContextMenu}
        setShamanConvertTarget={controller.setShamanConvertTarget}
        setMayorRedirectTarget={controller.setMayorRedirectTarget}
        setSpyDisguiseMode={controller.setSpyDisguiseMode}
        setSpyDisguiseProbability={controller.setSpyDisguiseProbability}
        setKlutzChoiceTarget={controller.setKlutzChoiceTarget}
        setVoteInputValue={controller.setVoteInputValue}
        setShowVoteErrorToast={controller.setShowVoteErrorToast}
        setVoteRecords={controller.setVoteRecords}
        setDayAbilityForm={controller.setDayAbilityForm}
        setDamselGuessUsedBy={controller.setDamselGuessUsedBy}
        setHadesiaChoices={controller.setHadesiaChoices}
        setWinResult={controller.setWinResult}
        setWinReason={controller.setWinReason}
        setSelectedActionTargets={controller.setSelectedActionTargets}
        setTodayDemonVoted={controller.setTodayDemonVoted}
        setSeats={controller.setSeats}
        setGamePhase={controller.setGamePhase}
        setShowShootModal={controller.setShowShootModal}
        setShowNominateModal={controller.setShowNominateModal}
        handleSeatClick={controller.onSeatClick}
        toggleStatus={controller.toggleStatus}
        handleMenuAction={controller.handleMenuAction}
        getRegistrationCached={controller.getRegistrationCached}
        isGoodAlignment={controller.isGoodAlignment}
        getSeatRoleId={controller.getSeatRoleId}
        cleanseSeatStatuses={controller.cleanseSeatStatuses}
        typeLabels={typeLabels}
        typeColors={typeColors}
        typeBgColors={typeBgColors}
        setDayAbilityLogs={controller.setDayAbilityLogs}
        setDamselGuessed={controller.setDamselGuessed}
        setShamanTriggered={controller.setShamanTriggered}
        setHadesiaChoice={controller.setHadesiaChoice}
        setShowAttackBlockedModal={controller.setShowAttackBlockedModal}
      />
    </>
  );
}

