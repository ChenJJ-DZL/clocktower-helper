/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Role, roles, type Seat, typeColors } from "../../../app/data";
import { useGameActions } from "../../contexts/GameActionsContext";
import { useAudio } from "../../hooks/useAudio";
import { useGameState } from "../../hooks/useGameState";
import { setAntagonismGlobalOverride } from "../../utils/antagonism";
import { fortuneTellerBoonManager } from "../../utils/FortuneTellerBoonManager";
import { showAlert, showConfirm } from "../../utils/nativeDialogShim";
import { getStorytellerTips } from "../../utils/storytellerTips";
import { RoundTable } from "./board/RoundTable";
import { GameConsole } from "./console/GameConsole";
import { GameLayout } from "./GameLayout";
import { GameModals } from "./GameModals";
import { GlobalNavBar } from "./GlobalNavBar";

// 全量重写的 GameStage 组件
export const GameStage = () => {
  const { playSound } = useAudio();
  // [REFACTOR] 分离方法和状态
  const controller = useGameActions();
  const gameState = useGameState();

  // 从 gameState 获取状态
  const {
    // 状态
    seats,
    gamePhase,
    selectedScript,
    nightCount,
    deadThisNight,
    timer,
    selectedActionTargets,
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
    autoRedHerringInfo,
    selectedRole,
    setSelectedRole,
    seatNotes, // Added seatNotes from context
    setSeatNotes, // Added setSeatNotes from context
    currentModal,
    setCurrentModal,
    setContextMenu,
    setShowMenu,
    setSelectedActionTargets,
    setInspectionResult,
    setCurrentWakeIndex,
    setSeats,
    setGamePhase,
    nominationRecords,
    gameId,
  } = gameState;

  // 检查玩家本黄昏是否已发起提名/已被提名
  const hasPlayerNominated = useCallback(
    (seatId: number) => {
      if (!nominationRecords?.nominators) return false;
      return nominationRecords.nominators instanceof Set
        ? nominationRecords.nominators.has(seatId)
        : Array.isArray(nominationRecords.nominators)
          ? (nominationRecords.nominators as number[]).includes(seatId)
          : false;
    },
    [nominationRecords]
  );

  const hasPlayerBeenNominated = useCallback(
    (seatId: number) => {
      if (!nominationRecords?.nominees) return false;
      return nominationRecords.nominees instanceof Set
        ? nominationRecords.nominees.has(seatId)
        : Array.isArray(nominationRecords.nominees)
          ? (nominationRecords.nominees as number[]).includes(seatId)
          : false;
    },
    [nominationRecords]
  );

  // 从 controller 获取方法和 ref
  const {
    nightInfo,
    // refs
    seatContainerRef,
    seatRefs,
    fakeInspectionResultRef,
    consoleContentRef,
    currentActionTextRef,
    longPressTimerRef,
    longPressTriggeredRef,
    checkLongPressTimerRef,

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
    handleStartNight,
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
    // getSeatPosition, // Already imported, no need to get from controller
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
    executeNomination,
    registerVotes,
    votedThisRound,

    setRedNemesisTarget,
  } = controller;

  // 计算左侧面板的缩放比例，使座位表适应容器
  const [_seatScale, setSeatScale] = useState(1);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [antagonismEnabled, setAntagonismEnabled] = useState<boolean>(false); // 相克规则开关（默认关闭）

  useEffect(() => {
    // 同步到全局规则层；null 表示按灯神检测，这里明确使用布尔值
    setAntagonismGlobalOverride(antagonismEnabled);
  }, [antagonismEnabled]);

  // Dusk Phase: Nomination state
  const [nominator, setNominator] = useState<number | null>(null);
  const [nominee, setNominee] = useState<number | null>(null);
  const [lastNominator, setLastNominator] = useState<number | null>(null);
  const [pendingVoteFor, setPendingVoteFor] = useState<number | null>(null);
  const [_defenseSecondsLeft, setDefenseSecondsLeft] = useState<number>(0);

  // Notes state
  const [_editingNoteTarget, setEditingNoteTarget] = useState<number | null>(
    null
  ); // Added state for NoteEditModal

  // VFX State
  const [_isShaking, setIsShaking] = useState(false);

  const triggerShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  }, []);
  const defenseTimerRef = useRef<number | null>(null);
  const [_lastCallSecondsLeft, setLastCallSecondsLeft] = useState<number>(0);
  const lastCallTimerRef = useRef<number | null>(null);
  const lastModalTypeRef = useRef<string | null>(null);
  const [isNominationLocked, setIsNominationLocked] = useState<boolean>(false);
  const aliveCoreCount = useMemo(
    () =>
      seats.filter(
        (s: Seat) => !s.isDead && s.role && s.role.type !== "traveler"
      ).length,
    [seats]
  );
  const voteThreshold = useMemo(
    () => Math.ceil(aliveCoreCount / 2),
    [aliveCoreCount]
  );

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

  const _startLastCall = useCallback(
    (seconds: number) => {
      stopLastCallTimer();
      setIsNominationLocked(false);
      setLastCallSecondsLeft(seconds);
      lastCallTimerRef.current = window.setInterval(() => {
        setLastCallSecondsLeft((prev) => {
          if (prev <= 1) {
            stopLastCallTimer();
            setIsNominationLocked(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [stopLastCallTimer]
  );

  const _startDefenseTimer = useCallback(
    (seconds: number) => {
      stopDefenseTimer();
      setDefenseSecondsLeft(seconds);
      defenseTimerRef.current = window.setInterval(() => {
        setDefenseSecondsLeft((prev) => {
          if (prev <= 1) {
            stopDefenseTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [stopDefenseTimer]
  );

  useEffect(() => {
    return () => {
      stopDefenseTimer();
      stopLastCallTimer();
      playSound("vote");
    };
  }, [stopDefenseTimer, stopLastCallTimer, playSound]);

  // 每次进入黄昏阶段时，重置本地黄昏状态，避免历史遗留状态导致按钮长时间不可用
  useEffect(() => {
    if (gamePhase === "dusk") {
      console.log("[GameStage] 进入黄昏阶段，重置所有黄昏状态");
      stopDefenseTimer();
      stopLastCallTimer();
      setNominator(null);
      setNominee(null);
      setPendingVoteFor(null);
      setLastNominator(null);
      setDefenseSecondsLeft(0);
      setLastCallSecondsLeft(0);
      setIsNominationLocked(false);
    }
  }, [gamePhase, stopDefenseTimer, stopLastCallTimer]); // 简化依赖项，只在 gamePhase 变化时执行

  // 监听投票模态框关闭（仅当曾经打开过 VOTE_INPUT 时才清除）
  useEffect(() => {
    const prevType = lastModalTypeRef.current;
    const currType = currentModal?.type ?? null;
    if (
      gamePhase === "dusk" &&
      prevType === "VOTE_INPUT" &&
      currType === null &&
      pendingVoteFor !== null
    ) {
      console.log(
        "[GameStage] 投票模态关闭，清除 pendingVoteFor，允许下一次提名"
      );
      setPendingVoteFor(null);
      setLastNominator(null);
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
    console.log("[isConfirmDisabled] Recalculating...");
    console.log("[isConfirmDisabled] gamePhase:", gamePhase);
    console.log("[isConfirmDisabled] nightInfo:", nightInfo);

    // CRITICAL FIX: In check phase, button should always be enabled to allow drunk charade selection
    if (gamePhase === "check" || gamePhase === "day" || gamePhase === "dusk") {
      console.log(
        `[isConfirmDisabled] In "${gamePhase}" phase, returning false. (handled by specialized buttons)`
      );
      return false;
    }

    // 特殊处理：nightInfo为空时，仍允许用户点击按钮推进
    if (!nightInfo) {
      if (gamePhase === "firstNight" || gamePhase === "night") {
        console.log(
          "[isConfirmDisabled] Night step with no nightInfo, allowing button (may be role with missing legacy config)"
        );
        return false;
      }
      console.log("[isConfirmDisabled] No nightInfo, returning true.");
      return true;
    }

    const isBlockingModal =
      currentModal &&
      !(
        currentModal.type === "NIGHT_ORDER_PREVIEW" ||
        currentModal.type === "REVIEW" ||
        currentModal.type === "GAME_RECORDS" ||
        currentModal.type === "ROLE_INFO" ||
        currentModal.type === "NIGHT_DEATH_REPORT"
      );

    console.log(
      "[isConfirmDisabled] isBlockingModal:",
      isBlockingModal,
      "currentModal:",
      currentModal
    );

    if (isBlockingModal) {
      console.log("[isConfirmDisabled] Has pending modals, returning true.");
      return true;
    }

    // 3. 检查当前目标选择是否符合要求
    if (nightInfo.targetLimit) {
      const { min } = nightInfo.targetLimit;
      console.log(
        `[isConfirmDisabled] Checking targets: selected = ${selectedActionTargets.length}, min required = ${min}`
      );
      if (selectedActionTargets.length < min) {
        console.log(
          "[isConfirmDisabled] Not enough targets selected, returning true."
        );
        return true;
      }
    }

    console.log("[isConfirmDisabled] All checks passed, returning false.");
    return false;
  }, [
    gamePhase,
    nightInfo,
    currentModal,
    selectedActionTargets,
    currentWakeIndex,
    wakeQueueIds,
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
  }, [
    gamePhase,
    nightInfo?.guide,
    seats,
    nightCount,
    deadThisNight,
    isGoodAlignment,
  ]);

  // 当前/下一个行动角色信息
  const currentWakeSeat = nightInfo
    ? seats.find((s: Seat) => s.id === nightInfo.seat.id)
    : null;
  const nextWakeSeatId = useMemo(() => {
    if (gamePhase !== "firstNight" && gamePhase !== "night") return null;
    for (let i = currentWakeIndex + 1; i < wakeQueueIds.length; i++) {
      const candidateId = wakeQueueIds[i];
      const s = seats.find((seat: Seat) => seat.id === candidateId);
      if (!s) continue;
      const isDead = s.isDead || (s as any).isAlive === false;
      const canActWhileDead =
        s.hasAbilityEvenDead ||
        (s.role?.id === "ravenkeeper" && deadThisNight.includes(candidateId)) ||
        (s.role?.id === "sage" && deadThisNight.includes(candidateId));
      if (!isDead || canActWhileDead) {
        return candidateId;
      }
    }
    return null;
  }, [gamePhase, currentWakeIndex, wakeQueueIds, seats, deadThisNight]);

  const nextWakeSeat =
    nextWakeSeatId !== null
      ? seats.find((s: Seat) => s.id === nextWakeSeatId)
      : null;
  const getDisplayRole = (seat: Seat | null | undefined) => {
    if (!seat) return null;
    const base = seat.role?.id === "drunk" ? seat.charadeRole : seat.role;
    return base;
  };
  const _currentWakeRole = getDisplayRole(currentWakeSeat);
  const _nextWakeRole = getDisplayRole(nextWakeSeat);

  // 拦截"确认&下一步"
  // 🔧 占卜师等信息角色已全部迁移到新引擎管道（fortune_teller.ability.ts 等）：
  //   新引擎统一处理 中毒/醉酒/Vortox 干扰（abilityPriorityCalculation +
  //   generateFakeResult）以及陌客/间谍判定，走 handleConfirmAction 即可。
  //   原 legacy 拦截计算（setPendingResult → INFO_RESULT）无中毒检测，
  //   会导致被毒占卜师仍得真实结果，已移除。
  const handleNightConfirm = useCallback(() => {
    // 直接确认（新引擎内部会处理弹窗与结果展示）
    handleConfirmAction();
  }, [
    currentWakeSeat,
    selectedActionTargets,
    handleConfirmAction,
  ]);

  // Handle Dusk Phase UI
  if (gamePhase === "dusk") {
    return (
      <GameLayout
        topBar={<GlobalNavBar />}
        leftPanel={
          <div className="relative w-full h-full p-4 flex items-center justify-center">
            {/* 相克规则开关（左上角，小按钮） */}
            <button
              type="button"
              onClick={() => setAntagonismEnabled((v) => !v)}
              className="absolute top-3 left-3 z-40 px-2 py-1 text-xs rounded-md border border-white/20 bg-slate-800/80 text-white shadow-sm hover:bg-slate-700/80"
              title={`相克规则：${antagonismEnabled ? "开" : "关"}`}
            >
              相克规则：{antagonismEnabled ? "开" : "关"}
            </button>
            <RoundTable
              seats={seats}
              nightInfo={null}
              selectedActionTargets={[]}
              isPortrait={isPortrait}
              longPressingSeats={new Set()}
              nominator={nominator}
              nominee={nominee}
              nominationRecords={nominationRecords}
              onSeatClick={(seat) => {
                // Nomination logic for dusk phase
                const seatId = seat;
                const clickedSeat = seats.find((s) => s.id === seatId);
                if (clickedSeat?.isDead) {
                  showAlert(`${seatId + 1}号玩家已死亡，不能发起或接受提名。`);
                  return;
                }
                if (nominator === null) {
                  // 正在选择提名者：检查是否本黄昏已发起过提名
                  if (hasPlayerNominated(seatId)) {
                    showAlert(
                      `${seatId + 1}号玩家在本黄昏已经发起过提名，每个角色每黄昏只能发起 1 次提名。`
                    );
                    return;
                  }
                  setNominator(seatId);
                } else if (nominee === null && seatId !== nominator) {
                  // 正在选择被提名者：检查是否本黄昏已被提名过
                  if (hasPlayerBeenNominated(seatId)) {
                    showAlert(
                      `${seatId + 1}号玩家在本黄昏已经被提名过，每个角色每黄昏只能被提名 1 次。`
                    );
                    return;
                  }
                  setNominee(seatId);
                } else if (nominee === null && seatId === nominator) {
                  // Clicking the same nominator - allow deselection
                  setNominator(null);
                }
              }}
              onContextMenu={(e, seatId) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, seatId });
              }}
              onTouchStart={(e, seatId) => {
                e.stopPropagation();
                const clickedSeat = seats.find((s) => s.id === seatId);
                if (clickedSeat?.isDead) {
                  showAlert(`${seatId + 1}号玩家已死亡，不能发起或接受提名。`);
                  return;
                }
                if (nominator === null) {
                  if (hasPlayerNominated(seatId)) {
                    showAlert(
                      `${seatId + 1}号玩家在本黄昏已经发起过提名，每个角色每黄昏只能发起 1 次提名。`
                    );
                    return;
                  }
                  setNominator(seatId);
                } else if (nominee === null && seatId !== nominator) {
                  if (hasPlayerBeenNominated(seatId)) {
                    showAlert(
                      `${seatId + 1}号玩家在本黄昏已经被提名过，每个角色每黄昏只能被提名 1 次。`
                    );
                    return;
                  }
                  setNominee(seatId);
                } else if (nominee === null && seatId === nominator) {
                  setNominator(null);
                }
              }}
              onTouchEnd={(e, _seatId) => {
                e.stopPropagation();
              }}
              onTouchMove={(e, _seatId) => {
                e.stopPropagation();
              }}
              setSeatRef={(id, el) => {
                if (el) seatRefs.current[id] = el;
              }}
              getDisplayRoleType={getDisplayRoleType}
              getDisplayRole={getDisplayRole}
              typeColors={typeColors}
              gamePhase={gamePhase}
              nightCount={nightCount}
              timer={timer}
              formatTimer={formatTimer}
              isTimerRunning={controller.isTimerRunning}
              onTimerStart={controller.handleTimerStart}
              onTimerPause={controller.handleTimerPause}
              onTimerReset={controller.handleTimerReset}
              onSetRedNemesis={setRedNemesisTarget}
              onEditNote={(seatId) => setEditingNoteTarget(seatId)} // Added onEditNote
              seatNotes={seatNotes} // Added seatNotes
            />

          </div>
        }
        rightPanel={
          <div className="h-full flex flex-col p-4 gap-2.5 overflow-hidden relative z-40 justify-between">
            {/* 顶部标题与门槛 */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
              <h2 className="text-xl font-black text-orange-400 tracking-wide flex items-center gap-1.5">
                <span>⚖️</span> 处决台与提名
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold">
                门槛: {voteThreshold} 票 ({aliveCoreCount}存活)
              </span>
            </div>

            {/* 动态提名引导与状态（从圆桌顶部迁移至此） */}
            <div className="px-3 py-1.5 rounded-lg bg-orange-950/40 border border-orange-500/30 text-orange-200 text-xs font-medium flex items-center justify-between shadow-sm shrink-0">
              <span className="flex items-center gap-1.5 truncate">
                <span>👉</span>
                <span className="truncate">
                  {nominator === null
                    ? "请在圆桌点击选择「提名者」（限 1 次）"
                    : nominee === null
                      ? `已选 ${nominator + 1}号，请点击选择「被提名者」（限 1 次）`
                      : `准备就绪: ${nominator + 1}号 提名 ${nominee + 1}号`}
                </span>
              </span>
              {(nominator !== null || nominee !== null) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNominator(null);
                    setNominee(null);
                  }}
                  className="text-[11px] text-red-400 hover:text-red-300 underline font-normal ml-2 shrink-0 cursor-pointer"
                >
                  重选
                </button>
              )}
            </div>

            {/* 处决台（上台者）与执行处决 */}
            <div className="bg-slate-800/90 p-3 rounded-lg border border-white/10 space-y-2 shrink-0">
              {(() => {
                const candidates: Array<{ id: number; voteCount: number }> =
                  seats
                    .filter((s: Seat) => s.isCandidate)
                    .map((s: Seat) => ({
                      id: s.id,
                      voteCount: s.voteCount || 0,
                    }))
                    .sort(
                      (
                        a: { id: number; voteCount: number },
                        b: { id: number; voteCount: number }
                      ) => b.voteCount - a.voteCount
                    );

                const topVotes = candidates.length > 0 ? candidates[0].voteCount : 0;
                const tops = candidates.filter((c) => c.voteCount === topVotes);
                const isTie = tops.length >= 2;

                return (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white font-bold flex items-center gap-1.5">
                        <span>🏛️</span> 处决台（上台者）
                      </span>
                      {candidates.length > 0 && (
                        <span className="text-xs text-yellow-300 font-bold">
                          最高 {topVotes} 票 {isTie ? "（⚠️平票）" : ""}
                        </span>
                      )}
                    </div>

                    {candidates.length === 0 ? (
                      <div className="text-xs text-gray-400 py-0.5">
                        暂无上台者（达到 {voteThreshold} 票方可上台）
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-20 overflow-y-auto">
                        {candidates.map((c) => (
                          <div
                            key={c.id}
                            className={`flex justify-between items-center text-xs rounded px-2 py-0.5 border ${
                              c.voteCount === topVotes
                                ? isTie
                                  ? "border-yellow-500/60 bg-yellow-900/20 text-yellow-100"
                                  : "border-red-500/60 bg-red-900/25 text-red-100 font-bold"
                                : "border-white/10 bg-slate-900/40 text-slate-200"
                            }`}
                          >
                            <span>
                              {c.id + 1}号 {seats[c.id]?.role?.name ? `(${seats[c.id].role.name})` : ""}
                            </span>
                            <span className="font-mono font-bold">
                              {c.voteCount} 票
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[GameStage] 点击执行处决按钮", {
                    executeJudgment: typeof executeJudgment,
                  });
                  try {
                    if (typeof executeJudgment !== "function") {
                      console.error(
                        "[GameStage] executeJudgment is not a function:",
                        executeJudgment
                      );
                      showAlert(
                        "错误：executeJudgment 函数不可用，请刷新页面重试。"
                      );
                      return;
                    }
                    triggerShake();
                    executeJudgment();
                    setPendingVoteFor(null);
                    setSeats((prev) =>
                      prev.map((s) => ({
                        ...s,
                        isCandidate: false,
                        voteCount: 0,
                      }))
                    );
                  } catch (error) {
                    console.error("[GameStage] 执行处决时出错:", error);
                    showAlert(
                      `执行处决时出错: ${error instanceof Error ? error.message : String(error)}`
                    );
                  }
                }}
                className="w-full py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-md text-xs shadow transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                ☠️ 执行处决结算
              </button>
            </div>

            {/* 提名与投票进程（紧凑精简版） */}
            <div className="bg-slate-800/90 p-2.5 rounded-lg border border-white/10 space-y-1.5 shrink-0 text-xs">
              <div className="flex items-center justify-between text-white font-bold">
                <span className="flex items-center gap-1.5">
                  <span>⚖️</span> 提名进程
                </span>
                {pendingVoteFor !== null && (
                  <span className="text-emerald-400 font-semibold text-[11px] animate-pulse">
                    ● 待投票: {pendingVoteFor + 1}号
                  </span>
                )}
              </div>

              {/* 提名双方对阵指示 */}
              <div className="flex items-center justify-around bg-slate-900/60 py-1 px-2 rounded border border-white/5 text-xs">
                <div className="text-center">
                  <span className="text-gray-400 text-[10px] block">提名者</span>
                  <span className="text-amber-300 font-bold">
                    {nominator !== null
                      ? `${nominator + 1}号 ${seats[nominator]?.role?.name ? `(${seats[nominator].role.name})` : ""}`
                      : lastNominator !== null
                        ? `${lastNominator + 1}号`
                        : "-"}
                  </span>
                </div>
                <span className="text-gray-500 font-bold text-sm">➔</span>
                <div className="text-center">
                  <span className="text-gray-400 text-[10px] block">被提名者</span>
                  <span className="text-cyan-300 font-bold">
                    {(nominee !== null || pendingVoteFor !== null)
                      ? `${(nominee ?? pendingVoteFor)! + 1}号 ${seats[(nominee ?? pendingVoteFor)!]?.role?.name ? `(${seats[(nominee ?? pendingVoteFor)!].role.name})` : ""}`
                      : "-"}
                  </span>
                </div>
              </div>

              {/* 简短记录已提名/被提名单 */}
              {((nominationRecords?.nominators &&
                (nominationRecords.nominators instanceof Set
                  ? nominationRecords.nominators.size > 0
                  : (nominationRecords.nominators as any).length > 0)) ||
                (nominationRecords?.nominees &&
                  (nominationRecords.nominees instanceof Set
                    ? nominationRecords.nominees.size > 0
                    : (nominationRecords.nominees as any).length > 0))) && (
                <div className="text-[11px] text-gray-400 space-y-0.5 pt-0.5 border-t border-white/5">
                  {nominationRecords?.nominators && (
                    <div className="truncate">
                      <span className="text-amber-400/90 font-medium">已提名:</span>{" "}
                      {Array.from(
                        nominationRecords.nominators instanceof Set
                          ? nominationRecords.nominators
                          : nominationRecords.nominators
                      )
                        .map((id: any) => `${id + 1}号`)
                        .join("、") || "无"}
                    </div>
                  )}
                  {nominationRecords?.nominees && (
                    <div className="truncate">
                      <span className="text-cyan-400/90 font-medium">被提过:</span>{" "}
                      {Array.from(
                        nominationRecords.nominees instanceof Set
                          ? nominationRecords.nominees
                          : nominationRecords.nominees
                      )
                        .map((id: any) => `${id + 1}号`)
                        .join("、") || "无"}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 核心操作按钮组（高度突出、一眼可见，无需滚动） */}
            <div className="flex flex-col gap-2 pt-1 shrink-0 relative z-50">
              {/* 取消提名选择按钮（仅在有选择时出现） */}
              {(nominator !== null || nominee !== null) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log("[GameStage] 取消提名选择");
                    setNominator(null);
                    setNominee(null);
                  }}
                  className="py-1.5 px-3 bg-red-950/50 text-red-300 border border-red-500/40 rounded-lg hover:bg-red-900/60 font-semibold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  ✕ 取消选择 ({nominator !== null ? `${nominator + 1}号` : ""}{nominee !== null ? ` → ${nominee + 1}号` : ""})
                </button>
              )}

              {/* 发起提名 (触发技能检测) */}
              <button
                type="button"
                disabled={isNominationLocked || pendingVoteFor !== null || nominator === null || nominee === null}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[GameStage] 点击发起提名按钮", {
                    nominator,
                    nominee,
                    isNominationLocked,
                    pendingVoteFor,
                    executeNomination: typeof executeNomination,
                  });
                  try {
                    if (pendingVoteFor !== null) {
                      showAlert("请先完成当前的投票流程");
                      return;
                    }
                    if (nominator === null || nominee === null) {
                      showAlert('请先在圆桌上依次点击"提名者"和"被提名者"。');
                      return;
                    }
                    const nominatorSeat = seats.find((s) => s.id === nominator);
                    const nomineeSeat = seats.find((s) => s.id === nominee);
                    if (nominatorSeat?.isDead || nomineeSeat?.isDead) {
                      showAlert("已死亡玩家不能发起或接受提名，请重新选择。");
                      setNominator(null);
                      setNominee(null);
                      return;
                    }
                    if (hasPlayerNominated(nominator)) {
                      showAlert(
                        `${nominator + 1}号玩家在本黄昏已经发起过提名，每个角色每黄昏只能发起 1 次提名。`
                      );
                      setNominator(null);
                      setNominee(null);
                      return;
                    }
                    if (hasPlayerBeenNominated(nominee)) {
                      showAlert(
                        `${nominee + 1}号玩家在本黄昏已经被提名过，每个角色每黄昏只能被提名 1 次。`
                      );
                      setNominator(null);
                      setNominee(null);
                      return;
                    }
                    if (typeof executeNomination !== "function") {
                      console.error(
                        "[GameStage] executeNomination is not a function:",
                        executeNomination
                      );
                      showAlert(
                        "错误：executeNomination 函数不可用，请刷新页面重试。"
                      );
                      return;
                    }
                    const result = executeNomination(nominator, nominee, {
                      openVoteModal: false,
                    });
                    if (
                      result === false ||
                      (typeof result === "object" &&
                        result !== null &&
                        (result as any).success === false)
                    ) {
                      setNominator(null);
                      setNominee(null);
                      return;
                    }
                    const virginHandled =
                      result === true ||
                      (typeof result === "object" &&
                        result !== null &&
                        (result as any).virginHandled === true);

                    if (!virginHandled) {
                      const nominatorRole = seats[nominator]?.role?.name
                        ? `-${seats[nominator].role.name}`
                        : "";
                      const nomineeRole = seats[nominee]?.role?.name
                        ? `-${seats[nominee].role.name}`
                        : "";
                      addLog(
                        `📣 【${nominator + 1}号${nominatorRole}】提名了【${nominee + 1}号${nomineeRole}】`
                      );
                    }
                    playSound("execute");
                    setNominator(null);
                    setNominee(null);
                    if (virginHandled) {
                      setPendingVoteFor(null);
                      setLastNominator(null);
                    } else {
                      setPendingVoteFor(nominee);
                      setLastNominator(nominator);
                      setCurrentModal({
                        type: "VOTE_INPUT",
                        data: { voterId: nominee },
                      });
                    }
                  } catch (error) {
                    console.error("[GameStage] 发起提名时出错:", error);
                    showAlert(
                      `发起提名时出错: ${error instanceof Error ? error.message : String(error)}`
                    );
                  }
                }}
                className={`py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center transition-all border shadow
                  ${
                    isNominationLocked || pendingVoteFor !== null || nominator === null || nominee === null
                      ? "bg-slate-800/80 text-slate-500 border-slate-700/60 cursor-not-allowed opacity-60"
                      : "bg-orange-600 hover:bg-orange-500 text-white border-orange-500 cursor-pointer shadow-orange-900/30 animate-pulse"
                  }`}
              >
                📣 发起提名 (触发技能检测)
              </button>

              {/* 开始投票 (打开举手名单面板) */}
              <button
                type="button"
                disabled={pendingVoteFor === null}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[GameStage] 点击开始投票按钮", {
                    pendingVoteFor,
                    setCurrentModal: typeof setCurrentModal,
                  });
                  try {
                    if (pendingVoteFor === null) return;
                    if (typeof setCurrentModal !== "function") {
                      console.error(
                        "[GameStage] setCurrentModal is not a function:",
                        setCurrentModal
                      );
                      showAlert(
                        "错误：setCurrentModal 函数不可用，请刷新页面重试。"
                      );
                      return;
                    }
                    stopDefenseTimer();
                    setDefenseSecondsLeft(0);
                    setCurrentModal({
                      type: "VOTE_INPUT",
                      data: { voterId: pendingVoteFor },
                    });
                  } catch (error) {
                    console.error("[GameStage] 开始投票时出错:", error);
                    showAlert(
                      `开始投票时出错: ${error instanceof Error ? error.message : String(error)}`
                    );
                  }
                }}
                className={`py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center transition-all border shadow
                  ${
                    pendingVoteFor === null
                      ? "bg-slate-800/80 text-slate-500 border-slate-700/60 cursor-not-allowed opacity-60"
                      : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500 cursor-pointer shadow-[0_0_20px_rgba(37,99,235,0.6)] animate-pulse"
                  }`}
              >
                🗳️ 开始投票 (打开举手名单面板)
              </button>

              {/* 入夜 (下一回合) */}
              <button
                type="button"
                onClick={() => {
                  const hasPendingVote = pendingVoteFor !== null;
                  const hasCandidates = seats.some((s: Seat) => s.isCandidate);
                  if (hasPendingVote || hasCandidates) {
                    showConfirm({
                      title: "直接入夜",
                      message: "仍有提名/候选未结算，确认直接入夜吗？",
                      onConfirm: () => {
                        if (handleStartNight) {
                          handleStartNight(false);
                        } else {
                          showAlert("无法开始夜晚，请检查游戏状态");
                        }
                      },
                    });
                    return;
                  }
                  if (handleStartNight) {
                    handleStartNight(false);
                  } else {
                    showAlert("无法开始夜晚，请检查游戏状态");
                  }
                }}
                className="py-3 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-black rounded-xl shadow-lg border border-amber-400/40 transition-all text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
              >
                入夜 (下一回合) 🌙
              </button>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <>
      <GameLayout
        topBar={<GlobalNavBar />}
        leftPanel={
          <div className="relative w-full h-full p-4">
            {/* 相克规则开关（左上角，小按钮） */}
            <button
              type="button"
              onClick={() => setAntagonismEnabled((v) => !v)}
              className="absolute top-3 left-3 z-40 px-2 py-1 text-xs rounded-md border border-white/20 bg-slate-800/80 text-white shadow-sm hover:bg-slate-700/80"
              title="相克规则开关（默认关闭，不产生影响）"
            >
              相克规则：{antagonismEnabled ? "开" : "关"}
            </button>

            {/* 随时技能区域（白天阶段，左上方） */}
            {gamePhase === "day" && (
              <div className="absolute top-3 left-40 z-40 flex gap-2">
                {seats.some(
                  (s) =>
                    s.role?.id === "slayer" &&
                    !s.isDead &&
                    !(s as any).abilityUsed
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      // 激活猎手技能：显示目标选择
                      const slayerSeat = seats.find(
                        (s) => s.role?.id === "slayer" && !s.isDead
                      );
                      if (slayerSeat) {
                        setCurrentModal({
                          type: "STORYTELLER_SELECT",
                          data: {
                            sourceId: slayerSeat.id,
                            roleId: "slayer",
                            roleName: "猎手",
                            description: "选择一名玩家作为射击目标",
                            targetCount: 1,
                            onConfirm: async (targetIds: number[]) => {
                              const targetId = targetIds[0];
                              if ((slayerSeat as any).abilityUsed) return;
                              // 标记技能已使用
                              (slayerSeat as any).abilityUsed = true;
                              const target = seats.find(
                                (s) => s.id === targetId
                              );
                              const isDemon = target?.role?.type === "demon";
                              if (isDemon) {
                                // 恶魔死亡
                                controller.killPlayer(targetId, {
                                  source: "slayer",
                                  recordNightDeath: false,
                                });
                                controller.addLog(
                                  `🏹 ${slayerSeat.id + 1}号猎手成功猎杀${targetId + 1}号恶魔！`
                                );
                                // 检查游戏结束
                                const updated = seats.map((s) =>
                                  s.id === targetId ? { ...s, isDead: true } : s
                                );
                                controller.checkGameOver(updated, targetId);
                              } else {
                                controller.addLog(
                                  `🏹 ${slayerSeat.id + 1}号猎手射击${targetId + 1}号，但目标不是恶魔`
                                );
                              }
                              setCurrentModal(null);
                            },
                          },
                        });
                      }
                    }}
                    className="px-3 py-1 text-xs font-bold rounded-md border border-yellow-400/40 bg-yellow-700/60 text-yellow-200 shadow-sm hover:bg-yellow-600/80 transition animate-pulse"
                    title="每局游戏限一次，白天选择一名玩家射击"
                  >
                    🏹 猎手技能
                  </button>
                )}
                {/* 🗣 造谣者（Gossip）白天公开声明 */}
                {seats.some(
                  (s) =>
                    s.role?.id === "gossip" &&
                    !s.isDead &&
                    !(gameState as any).gossipStatementToday
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      const gossipSeat = seats.find(
                        (s) => s.role?.id === "gossip" && !s.isDead
                      );
                      if (gossipSeat) {
                        setCurrentModal({
                          type: "DAY_ABILITY",
                          data: {
                            roleId: "gossip",
                            seatId: gossipSeat.id,
                          },
                        });
                      }
                    }}
                    className="px-3 py-1 text-xs font-bold rounded-md border border-purple-400/40 bg-purple-700/60 text-purple-200 shadow-sm hover:bg-purple-600/80 transition animate-pulse"
                    title="造谣者：白天可公开声明一次，说书人裁定真假；若为真，当晚额外死亡一人"
                  >
                    🗣 造谣声明
                  </button>
                )}
              </div>
            )}
            <RoundTable
              seats={seats}
              nightInfo={nightInfo}
              selectedActionTargets={selectedActionTargets}
              isPortrait={isPortrait}
              longPressingSeats={longPressingSeats}
              onSeatClick={onSeatClick}
              onContextMenu={(e, seatId) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, seatId });
              }}
              onTouchStart={(e, seatId) => {
                e.stopPropagation();
                const existingTimer = longPressTimerRef.current.get(seatId);
                if (existingTimer) clearTimeout(existingTimer);
                setLongPressingSeats((prev: Set<number>) =>
                  new Set(prev).add(seatId)
                );
                longPressTriggeredRef.current.delete(seatId);
                const timer = setTimeout(() => {
                  setContextMenu({
                    x: e.touches[0]?.clientX ?? 0,
                    y: e.touches[0]?.clientY ?? 0,
                    seatId,
                  });
                  longPressTriggeredRef.current.add(seatId);
                  longPressTimerRef.current.delete(seatId);
                  setLongPressingSeats((prev: Set<number>) => {
                    const next = new Set(prev);
                    next.delete(seatId);
                    return next;
                  });
                }, 500);
                longPressTimerRef.current.set(seatId, timer as any);
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
                if (el) seatRefs.current[id] = el;
              }}
              getDisplayRoleType={getDisplayRoleType}
              getDisplayRole={getDisplayRole}
              typeColors={typeColors}
              gamePhase={gamePhase}
              nightCount={nightCount}
              timer={timer}
              formatTimer={formatTimer}
              isTimerRunning={controller.isTimerRunning}
              onTimerStart={controller.handleTimerStart}
              onTimerPause={controller.handleTimerPause}
              onTimerReset={controller.handleTimerReset}
              nightOrderPreview={nightOrderPreviewLive || nightOrderPreview}
              onOpenNightOrderPreview={undefined}
              onSetRedNemesis={setRedNemesisTarget}
              onEditNote={(seatId) => setEditingNoteTarget(seatId)} // Added onEditNote
              seatNotes={seatNotes} // Added seatNotes
            />
          </div>
        }
        rightPanel={
          <GameConsole
            gamePhase={gamePhase}
            nightCount={nightCount}
            currentStep={currentWakeIndex + 1}
            totalSteps={(wakeQueueIds || []).length}
            wakeQueueIds={wakeQueueIds}
            scriptText={
              nightInfo?.speak ||
              (gamePhase === "day"
                ? "白天讨论阶段"
                : (gamePhase as string) === "dusk"
                  ? "黄昏处决阶段"
                  : undefined)
            }
            guidancePoints={guidancePoints}
            selectedPlayers={selectedActionTargets}
            seats={seats}
            nightInfo={nightInfo}
            inspectionResult={inspectionResult}
            inspectionResultKey={inspectionResultKey}
            onTogglePlayer={toggleTarget}
            handleDayAbility={controller.handleDayAbility}
            handleViewDayAbilityResult={controller.handleViewDayAbilityResult}
            onRefreshNightStep={() => {
              if (
                controller.refreshSnapshot &&
                (gamePhase === "firstNight" || gamePhase === "night")
              ) {
                controller.refreshSnapshot(seats, gamePhase);
              }
            }}
            primaryAction={
              gamePhase === "firstNight" || gamePhase === "night"
                ? (() => {
                    // CRITICAL FIX: Handle empty wake queue or last step
                    const isEmpty = wakeQueueIds.length === 0;
                    // 当前索引等于最后一步时仍有一个夜间行动尚未确认；
                    // 只有索引已经越过队列末尾，才真正进入“天亮了”的收尾步骤。
                    const isPastLastStep =
                      !isEmpty && currentWakeIndex > wakeQueueIds.length - 1;

                    if (isEmpty || isPastLastStep) {
                      // Explicit "Enter Day" button for empty queue or dawn step
                      return {
                        label: "🌞 天亮了 - 进入白天",
                        onClick: () => {
                          console.log(
                            "🌞 [UI] Manual override to Day - Empty queue or dawn step"
                          );
                          // Call continueToNextAction which will show death report and transition
                          controller.continueToNextAction();
                        },
                        disabled: !!controller.currentModal, // Disable if modal is open
                        variant: "warning" as const,
                      };
                    }

                    // 间谍环节：显示"展开对局记录"，点击后弹窗关闭时自动推进
                    const isSpyTurn = nightInfo?.effectiveRole?.id === "spy";
                    if (isSpyTurn && !controller.currentModal) {
                      return {
                        label: "展开对局记录",
                        onClick: handleConfirmAction,
                        disabled: isConfirmDisabled,
                        variant: "primary" as const,
                      };
                    }

                    // Normal "Next" button for night steps
                    return {
                      label: "确认 & 下一步",
                      onClick: handleNightConfirm,
                      disabled: isConfirmDisabled || !!controller.currentModal, // Disable if modal is open
                      variant: "primary" as const,
                    };
                  })()
                : gamePhase === "check"
                  ? (() => {
                      const drunkSeat = seats.find(
                        (s: any) => s.role?.id === "drunk" && !s.charadeRole
                      );
                      if (drunkSeat) {
                        const currentScriptRoleIds =
                          selectedScript?.roleIds || [];
                        const seenIds = new Set<string>();
                        const currentScriptRoles = roles.filter(
                          (role: Role) => {
                            if (!currentScriptRoleIds.includes(role.id))
                              return false;
                            if (seenIds.has(role.id)) return false;
                            seenIds.add(role.id);
                            return true;
                          }
                        );
                        const charadesFiltered = currentScriptRoles.filter(
                          (role: Role) =>
                            role.type === "townsfolk" &&
                            !role.hidden &&
                            !seats.some((s: any) => s.role?.id === role.id)
                        );
                        // 🔧 修复：所有镇民已在场时回退为全部镇民可选，避免弹窗无选项死局
                        const availableCharades =
                          charadesFiltered.length > 0
                            ? charadesFiltered
                            : currentScriptRoles.filter(
                                (role: Role) =>
                                  role.type === "townsfolk" && !role.hidden
                              );
                        return {
                          label: "🎭 设置酒鬼身份",
                          onClick: () => {
                            setCurrentModal({
                              type: "DRUNK_CHARADE_SELECT",
                              data: {
                                seatId: drunkSeat.id,
                                availableRoles: availableCharades,
                                scriptId: selectedScript?.id || "default",
                              },
                            });
                          },
                          disabled: false,
                          variant: "primary" as const,
                        };
                      }
                      return {
                        label: "确认无误，入夜 🌙",
                        onClick: () => {
                          console.log("🖱️ [UI] User clicked 'Enter Night'");
                          if (controller.proceedToFirstNight) {
                            controller.proceedToFirstNight();
                          } else {
                            console.error(
                              "[GameStage] proceedToFirstNight not available on controller"
                            );
                            showAlert(
                              "游戏状态错误：无法开始夜晚。请刷新页面重试。"
                            );
                          }
                        },
                        disabled: isConfirmDisabled,
                        variant: "success" as const,
                      };
                    })()
                  : gamePhase === "day"
                    ? {
                        label: "进入黄昏处决阶段",
                        onClick: () => {
                          console.log(
                            "[GameStage] Day phase primary action -> handleDayEndTransition"
                          );
                          handleDayEndTransition();
                        },
                        disabled: false,
                        variant: "primary" as const,
                      }
                    : undefined
            }
            secondaryActions={
              gamePhase === "firstNight" || gamePhase === "night"
                ? [
                    {
                      label: "上一步",
                      onClick: handleStepBack,
                      disabled: currentWakeIndex === 0 && history.length === 0,
                    },
                  ]
                : []
            }
            onForceContinue={() => {
              // 强制继续回调：当队列为空时，直接进入天亮阶段
              console.log(
                "[GameStage] onForceContinue called - forcing transition to day"
              );
              if (controller.continueToNextAction) {
                controller.continueToNextAction();
              } else {
                // 备用方案：通过 context 或者直接放弃备用方案
                console.warn(
                  "Fallback: no setGamePhase available without props"
                );
              }
            }}
          />
        }
      />
      {/* Modals rendered outside layout to ensure proper z-index */}
    </>
  );
};

// [REFACTOR] GameStageWithModals 不再需要 prop drilling
// GameStage 和 GameModals 都通过 Context 获取所需的 state 和 action
export function GameStageWithModals() {
  return (
    <>
      <GameStage />
      <GameModals />
    </>
  );
}
