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
    nightOrderPreview,
    nightOrderPreviewLive,
    setShowNightOrderModal,
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
    setRedNemesisTarget,
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
    console.log('[isConfirmDisabled] Recalculating...');
    console.log('[isConfirmDisabled] gamePhase:', gamePhase);
    console.log('[isConfirmDisabled] nightInfo:', nightInfo);

    // CRITICAL FIX: In check phase, button should always be enabled to allow drunk charade selection
    if (gamePhase === 'check' || gamePhase === 'day' || gamePhase === 'dusk') {
      console.log(`[isConfirmDisabled] In "${gamePhase}" phase, returning false. (handled by specialized buttons)`);
      return false;
    }

    // For night phases, must have nightInfo
    if (!nightInfo) {
      console.log('[isConfirmDisabled] No nightInfo, returning true.');
      return true;
    }

    const isBlockingModal = currentModal && !(
      currentModal.type === 'NIGHT_ORDER_PREVIEW' ||
      currentModal.type === 'REVIEW' ||
      currentModal.type === 'GAME_RECORDS' ||
      currentModal.type === 'ROLE_INFO'
    );

    const hasPendingModals =
      isBlockingModal ||
      showKillConfirmModal !== null ||
      showHadesiaKillConfirmModal !== null ||
      showRavenkeeperFakeModal !== null ||
      showMoonchildKillModal !== null ||
      showBarberSwapModal !== null ||
      showStorytellerDeathModal !== null ||
      showSweetheartDrunkModal !== null ||
      showKlutzChoiceModal !== null ||
      showPitHagModal !== null;

    console.log('[isConfirmDisabled] isBlockingModal:', isBlockingModal, 'currentModal:', currentModal);
    console.log('[isConfirmDisabled] hasPendingModals:', hasPendingModals);

    if (hasPendingModals) {
      console.log('[isConfirmDisabled] Has pending modals, returning true.');
      return true;
    }

    // 3. 检查当前目标选择是否符合要求
    if (nightInfo.targetLimit) {
      const { min } = nightInfo.targetLimit;
      console.log(`[isConfirmDisabled] Checking targets: selected = ${selectedActionTargets.length}, min required = ${min}`);
      if (selectedActionTargets.length < min) {
        console.log('[isConfirmDisabled] Not enough targets selected, returning true.');
        return true;
      }
    }

    console.log('[isConfirmDisabled] All checks passed, returning false.');
    return false;
  }, [
    gamePhase,
    seats,
    nightInfo,
    currentModal,
    showKillConfirmModal,
    showHadesiaKillConfirmModal,
    showRavenkeeperFakeModal,
    showMoonchildKillModal,
    showBarberSwapModal,
    showStorytellerDeathModal,
    showSweetheartDrunkModal,
    showKlutzChoiceModal,
    showPitHagModal,
    selectedActionTargets,
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
                  // Nomination logic for dusk phase
                  if (nominator === null) {
                    // No nominator selected - select this seat as nominator
                    setNominator(seat.id);
                  } else if (nominee === null && seat.id !== nominator) {
                    // Nominator selected but no nominee - select this seat as nominee
                    setNominee(seat.id);
                  } else if (nominee === null && seat.id === nominator) {
                    // Clicking the same nominator - allow deselection
                    setNominator(null);
                  }
                  // If both nominator and nominee are selected, ignore clicks
                  // User must use the "发起提名" button or cancel nomination to change selection
                }}
                onContextMenu={(e, seatId) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, seatId });
                }}
                onTouchStart={(e, seatId) => {
                  e.stopPropagation();
                  if (nominator === null) {
                    // No nominator selected - select this seat as nominator
                    setNominator(seatId);
                  } else if (nominee === null && seatId !== nominator) {
                    // Nominator selected but no nominee - select this seat as nominee
                    setNominee(seatId);
                  } else if (nominee === null && seatId === nominator) {
                    // Clicking the same nominator - allow deselection
                    setNominator(null);
                  }
                  // If both nominator and nominee are selected, ignore touches
                  // User must use the nomination button or cancel to change selection
                }}
                onTouchEnd={(e, seatId) => {
                  e.stopPropagation();
                }}
                onTouchMove={(e, seatId) => {
                  e.stopPropagation();
                }}
                setSeatRef={(id, el) => {
                  seatRefs.current[id] = el;
                }}
                getDisplayRoleType={getDisplayRoleType}
                getDisplayRole={getDisplayRole}
                typeColors={typeColors}
                gamePhase={gamePhase}
                nightCount={nightCount}
                timer={timer}
                formatTimer={formatTimer}
                onTimerStart={controller.handleTimerStart}
                onTimerPause={controller.handleTimerPause}
                onTimerReset={controller.handleTimerReset}
                onSetRedNemesis={setRedNemesisTarget}
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

            {/* Execution Block (Candidates) - Refined UI */}
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
                          className={`flex justify-between text-sm rounded px-2 py-1 border ${c.voteCount === topVotes
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

              <button
                type="button"
                onClick={(e) => {
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
                className="w-full mt-2 p-3 bg-red-600 text-white font-bold rounded-lg text-lg shadow-lg hover:bg-red-500 transition-colors cursor-pointer relative z-50 h-12 flex items-center justify-center"
                style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                ☠️ 执行处决
              </button>
            </div>

            {/* Combined Nomination & Voting Process Block */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-4 border border-white/10">
              <h3 className="text-white font-bold flex items-center gap-2 border-b border-white/10 pb-2">
                <span>⚖️</span> 提名与投票进程
              </h3>

              {/* Primary: Nominator -> Nominee */}
              <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-white/5">
                {(nominator === null && nominee === null && pendingVoteFor === null) ? (
                  <div className="text-gray-400 text-sm w-full text-center py-1">等待发启提名...</div>
                ) : (
                  <>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">提名者</span>
                      <span className="text-amber-400 font-bold text-xl">
                        {nominator !== null ? `${nominator + 1}号` : '-'}
                      </span>
                    </div>
                    <div className="text-gray-600 font-bold">➡️</div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">被提名者</span>
                      <span className="text-amber-400 font-bold text-xl">
                        {(nominee || pendingVoteFor) !== null
                          ? `${(nominee || pendingVoteFor)! + 1}号`
                          : '-'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-700/30 p-2 rounded border border-white/5">
                  <div className="text-gray-400 text-xs mb-1">上台门槛</div>
                  <div className="font-bold text-white">
                    {voteThreshold} 票 <span className="text-xs font-normal text-gray-400">({aliveCoreCount}存活)</span>
                  </div>
                </div>
                <div className="bg-slate-700/30 p-2 rounded border border-white/5">
                  <div className="text-gray-400 text-xs mb-1">最后一次提名</div>
                  <div className="font-bold text-white">不限时(手动)</div>
                </div>
                <div className="bg-slate-700/30 p-2 rounded border border-white/5 col-span-2">
                  <div className="text-gray-400 text-xs mb-1">辩护时间 / 规则</div>
                  <div className="font-bold text-white flex justify-between">
                    <span>不限时(手动)</span>
                    <span className="text-xs font-normal text-gray-400">提名后点「开始投票」</span>
                  </div>
                </div>
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



            {/* Actions */}
            <div className="flex flex-col gap-3 relative z-50">
              {/* Cancel Nomination Selection Button - only show if there are selections */}
              {(nominator !== null || nominee !== null) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('[GameStage] 取消提名选择');
                    setNominator(null);
                    setNominee(null);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  className="p-3 bg-red-600/20 text-red-400 border border-red-600/50 rounded-lg hover:bg-red-600 hover:text-white transition-all font-semibold cursor-pointer relative z-50 text-sm h-14 flex items-center justify-center"
                  style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
                >
                  ❌ 取消提名选择
                </button>
              )}

              <button
                type="button"
                // 1. 发起提名按钮：在有待投票（pendingVoteFor !== null）时禁用
                disabled={isNominationLocked || pendingVoteFor !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[GameStage] 点击发起提名按钮', { nominator, nominee, isNominationLocked, pendingVoteFor, executeNomination: typeof executeNomination });
                  try {
                    // Double check logic inside (UI should be disabled though)
                    if (pendingVoteFor !== null) {
                      alert("请先完成当前的投票流程");
                      return;
                    }

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
                // Dynamic Class: 
                // Disabled: Grey/Dark
                // Active: Orange/Normal
                className={`p-4 rounded-lg font-semibold cursor-pointer relative z-50 h-14 flex items-center justify-center transition-all border
                  ${(isNominationLocked || pendingVoteFor !== null)
                    ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed opacity-70'
                    : 'bg-orange-600/20 text-orange-500 border-orange-600/50 hover:bg-orange-600 hover:text-white'
                  }`}
                style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                📣 发起提名 (触发技能检测)
              </button>

              <button
                type="button"
                // 2. 开始投票按钮：只有在有待投票（pendingVoteFor !== null）时才启用
                disabled={pendingVoteFor === null}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[GameStage] 点击开始投票按钮', { pendingVoteFor, setCurrentModal: typeof setCurrentModal });
                  try {
                    if (pendingVoteFor === null) {
                      // Should be blocked by disabled prop, but just in case
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
                // Dynamic Class:
                // Disabled: Grey/Dark
                // Active: Blue Solid + Pulse
                className={`p-4 rounded-lg font-semibold cursor-pointer relative z-50 h-14 flex items-center justify-center transition-all border
                   ${pendingVoteFor === null
                    ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed opacity-70'
                    : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.6)] animate-pulse'
                  }`}
                style={{ pointerEvents: 'auto', touchAction: 'auto', WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                🗳️ 开始投票（打开举手名单面板）
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
                }, 500);
                longPressTimerRef.current.set(seatId, timer as unknown as number);
              }}
              onTouchEnd={(e, seatId) => {
                e.stopPropagation();
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
              getDisplayRole={getDisplayRole}
              typeColors={typeColors}
              gamePhase={gamePhase}
              nightCount={nightCount}
              timer={timer}
              formatTimer={formatTimer}
              onTimerStart={controller.handleTimerStart}
              onTimerPause={controller.handleTimerPause}
              onTimerReset={controller.handleTimerReset}
              nightOrderPreview={nightOrderPreviewLive || nightOrderPreview}
              onOpenNightOrderPreview={setShowNightOrderModal ? () => setShowNightOrderModal(true) : undefined}
              onSetRedNemesis={setRedNemesisTarget}
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
                      disabled: !!controller.currentModal, // Disable if modal is open
                      variant: 'warning' as const,
                    };
                  }

                  // Normal "Next" button for night steps
                  return {
                    label: '确认 & 下一步',
                    onClick: handleConfirmAction,
                    disabled: isConfirmDisabled || !!controller.currentModal, // Disable if modal is open
                    variant: 'primary' as const,
                  };
                })()
                : gamePhase === 'check'
                  ? {
                    label: '确认无误，入夜 🌙',
                    onClick: () => {
                      console.log("🖱️ [UI] User clicked 'Enter Night'");
                      // Use the synchronous proceedToFirstNight function which will handle drunk charade selection
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
                    : gamePhase === 'setup'
                      ? {
                        label: '确认 & 下一步',
                        onClick: () => {
                          console.log('[GameStage] Setup phase primary action -> Clear selectedRole');
                          setSelectedRole(null);
                        },
                        disabled: !selectedRole,
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
        handleDrunkCharadeSelect={controller.handleDrunkCharadeSelect}
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

