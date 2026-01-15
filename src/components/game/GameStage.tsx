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
  
  // Dusk Phase: Nomination state
  const [nominator, setNominator] = useState<number | null>(null);
  const [nominee, setNominee] = useState<number | null>(null);
  
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
      const hasPendingDrunk = seats.some(s => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
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
    
    // TEMPORARY FIX: If poisoner modal is set, check if it's actually visible in DOM
    // If modal exists in state but not visible, allow bypass
    if (showPoisonConfirmModal !== null) {
      // Check if modal is actually visible in DOM
      const modalVisible = typeof document !== 'undefined' && 
        document.querySelector('[data-modal-key*="确认下毒"]') !== null;
      console.log('[isConfirmDisabled] Poison modal state:', showPoisonConfirmModal, 'Visible in DOM:', modalVisible);
      
      // If modal is not visible after a delay, allow bypass (modal might be broken)
      // This is a temporary workaround until we fix the modal visibility issue
      if (!modalVisible) {
        console.warn('[isConfirmDisabled] Poison modal not visible in DOM, allowing bypass');
        // Don't disable - allow user to proceed
        // But still check other modals
        const otherModals = 
          showKillConfirmModal !== null ||
          showPoisonEvilConfirmModal !== null ||
          showHadesiaKillConfirmModal !== null ||
          showRavenkeeperFakeModal !== null ||
          showMoonchildKillModal !== null ||
          showBarberSwapModal !== null ||
          showStorytellerDeathModal !== null ||
          showSweetheartDrunkModal !== null ||
          showKlutzChoiceModal !== null ||
          showPitHagModal !== null;
        return otherModals;
      }
    }
    
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
            <ScaleToFit>
              <RoundTable
                seats={seats}
                nightInfo={null}
                selectedActionTargets={[]}
                isPortrait={isPortrait}
                longPressingSeats={new Set()}
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
          <div className="w-[450px] bg-slate-900 border-l border-white/10 flex flex-col p-6 gap-4 overflow-y-auto">
            <h2 className="text-2xl font-black text-orange-500 uppercase tracking-wide">⚖️ 处决台</h2>
            
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

            {/* Voting Recorder */}
            <div className="bg-slate-800 p-4 rounded-lg space-y-3 border border-white/10">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>✋</span> 投票记录器
              </h3>
              <p className="text-xs text-gray-400">请记录所有举手的玩家，用于卖花女/城镇公告员的信息计算。</p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const input = prompt("请输入所有举票玩家的座位号 (用逗号分隔，例如 1,3,5):");
                    if (input) {
                      const ids = input.split(/[,，]/).map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n) && n >= 0 && n < seats.length);
                      if (ids.length > 0) {
                        registerVotes(ids);
                        alert(`已记录 ${ids.length} 名玩家投票。卖花女/城镇公告员将能读取此信息。`);
                      } else {
                        alert("无效的输入，请使用数字并用逗号分隔");
                      }
                    }
                  }}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors"
                >
                  📝 录入投票数据
                </button>
                <button
                  onClick={() => {
                    registerVotes([]);
                    alert("已清空投票记录");
                  }}
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors"
                >
                  清空
                </button>
              </div>
              {votedThisRound && votedThisRound.length > 0 && (
                <div className="text-xs text-gray-300">
                  已记录: {votedThisRound.map(id => `${id + 1}号`).join(', ')}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button 
                disabled={nominator === null || nominee === null}
                onClick={() => {
                  if (nominator !== null && nominee !== null) {
                    // Call executeNomination (which handles Virgin trigger from Step 4)
                    executeNomination(nominator, nominee);
                    addLog(`📣 ${nominator + 1}号 提名了 ${nominee + 1}号`);
                    // Reset selection
                    setNominator(null);
                    setNominee(null);
                  }
                }}
                className="p-4 bg-orange-600/20 text-orange-500 border border-orange-600/50 rounded-lg hover:bg-orange-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
              >
                📣 发起提名 (触发技能检测)
              </button>
              
              <div className="h-px bg-white/10 my-2"></div>

              <button 
                onClick={() => {
                  const targetStr = prompt(`请输入要处决的玩家座位号 (1-${seats.length})，如果没有人被处决，点击取消:`);
                  if (targetStr) {
                    const tid = parseInt(targetStr) - 1;
                    if (!isNaN(tid) && tid >= 0 && tid < seats.length) {
                      const targetSeat = seats.find(s => s.id === tid);
                      if (!targetSeat) {
                        alert(`座位 ${tid + 1} 不存在`);
                        return;
                      }
                      if (targetSeat.isDead) {
                        alert(`座位 ${tid + 1} 已经死亡`);
                        return;
                      }
                      
                      // Execute player (this handles Saint check, etc.)
                      executePlayer(tid);
                      addLog(`⚖️ ${tid + 1}号 被处决死亡。`);
                      
                      // Check Game Over immediately after (with a small delay to let state update)
                      setTimeout(() => {
                        const updatedSeats = seats.map(s => s.id === tid ? { ...s, isDead: true } : s);
                        const result = checkGameOverSimple(updatedSeats);
                        if (result === 'good') {
                          alert("🎉 恶魔已死，好人获胜！");
                        } else if (result === 'evil') {
                          alert("😈 只剩两人，邪恶获胜！");
                        }
                      }, 100);
                    } else {
                      alert(`无效的座位号，请输入 1-${seats.length} 之间的数字`);
                    }
                  }
                }}
                className="p-4 bg-red-600 text-white font-black rounded-lg text-xl shadow-lg hover:bg-red-500 transition-colors"
              >
                ☠️ 执行处决
              </button>
            </div>

            <div className="mt-auto pt-4 border-t border-white/10">
              <button 
                onClick={() => {
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
          {/* 夜晚时间线：桌面右上角，单列垂直显示 */}
          {(gamePhase === "firstNight" || gamePhase === "night") && wakeQueueIds.length > 0 && (
            <div className="absolute top-4 right-4 z-20 max-h-[60%] overflow-y-auto flex flex-col gap-2 items-stretch">
              {wakeQueueIds.map((seatId, index) => {
                const seat = seats.find(s => s.id === seatId);
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
          guidancePoints={nightInfo?.guide ? [nightInfo.guide] : []}
          selectedPlayers={selectedActionTargets}
                    seats={seats}
          nightInfo={nightInfo}
          onTogglePlayer={toggleTarget}
          handleDayAbility={controller.handleDayAbility}
          primaryAction={
            (gamePhase === 'firstNight' || gamePhase === 'night')
              ? (() => {
                  // CRITICAL FIX: Check if we're at the last step (dawn)
                  const isLastStep = currentWakeIndex >= wakeQueueIds.length - 1;
                  
                  if (isLastStep) {
                    // Explicit "Enter Day" button for dawn step
                    return {
                      label: '🌞 天亮了 - 进入白天',
                      onClick: () => {
                        console.log("🌞 [UI] Manual override to Day - Dawn step");
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
                    const hasPendingDrunk = seats.some(s => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
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
        gamePhase={gamePhase}
        winResult={controller.winResult}
        winReason={controller.winReason}
        deadThisNight={deadThisNight}
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
        selectedScript={selectedScript}
        seats={seats}
        roles={roles}
        filteredGroupedRoles={controller.filteredGroupedRoles}
          groupedRoles={groupedRoles}
        gameLogs={controller.gameLogs}
        gameRecords={controller.gameRecords}
        isPortrait={isPortrait}
        nightInfo={nightInfo}
        selectedActionTargets={selectedActionTargets}
        initialSeats={controller.initialSeats}
        nominationRecords={controller.nominationRecords}
          evilTwinPair={evilTwinPair && "evilId" in evilTwinPair ? [evilTwinPair.evilId, evilTwinPair.goodId] : null}
        remainingDays={remainingDays}
          cerenovusTarget={
            cerenovusTarget
              ? typeof cerenovusTarget === "number"
                ? cerenovusTarget
                : cerenovusTarget.targetId
              : null
          }
        nightCount={nightCount}
        currentWakeIndex={currentWakeIndex}
        history={history}
        isConfirmDisabled={isConfirmDisabled}
        closeNightOrderPreview={closeNightOrderPreview}
        confirmNightOrderPreview={confirmNightOrderPreview}
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
        executePlayer={executePlayer}
        saveHistory={saveHistory}
        markDailyAbilityUsed={controller.markDailyAbilityUsed}
        markAbilityUsed={controller.markAbilityUsed}
        insertIntoWakeQueueAfterCurrent={controller.insertIntoWakeQueueAfterCurrent}
        continueToNextAction={controller.continueToNextAction}
        addLog={addLog}
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
        setShowDamselGuessModal={setShowDamselGuessModal}
        setShowShamanConvertModal={setShowShamanConvertModal}
        setShowMayorRedirectModal={controller.setShowMayorRedirectModal}
        setShowNightDeathReportModal={setShowNightDeathReportModal}
        setShowRestartConfirmModal={controller.setShowRestartConfirmModal}
        setShowSpyDisguiseModal={setShowSpyDisguiseModal}
        setShowMayorThreeAliveModal={controller.setShowMayorThreeAliveModal}
        setShowDrunkModal={setShowDrunkModal}
        setShowVoteInputModal={controller.setShowVoteInputModal}
        setShowRoleSelectModal={controller.setShowRoleSelectModal}
        setShowMadnessCheckModal={controller.setShowMadnessCheckModal}
        setShowDayActionModal={setShowDayActionModal}
        setVirginGuideInfo={controller.setVirginGuideInfo}
        setShowDayAbilityModal={controller.setShowDayAbilityModal}
        setShowSaintExecutionConfirmModal={controller.setShowSaintExecutionConfirmModal}
        setShowLunaticRpsModal={controller.setShowLunaticRpsModal}
        setShowVirginTriggerModal={controller.setShowVirginTriggerModal}
        setShowReviewModal={setShowReviewModal}
        setShowGameRecordsModal={setShowGameRecordsModal}
        setShowRoleInfoModal={setShowRoleInfoModal}
        setContextMenu={setContextMenu}
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
        setSelectedActionTargets={setSelectedActionTargets}
        setTodayDemonVoted={controller.setTodayDemonVoted}
        setSeats={setSeats}
        setGamePhase={setGamePhase}
        setShowShootModal={controller.setShowShootModal}
        setShowNominateModal={controller.setShowNominateModal}
        handleSeatClick={onSeatClick}
        toggleStatus={toggleStatus}
          handleMenuAction={controller.handleMenuAction}
        getRegistrationCached={controller.getRegistrationCached}
        isGoodAlignment={controller.isGoodAlignment}
        getSeatRoleId={getSeatRoleId}
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

