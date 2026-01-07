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
  } = controller;

  // 计算左侧面板的缩放比例，使座位表适应容器
  const [seatScale, setSeatScale] = useState(1);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  
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

  // 供 ControlPanel 使用的禁用逻辑（保持最小必要逻辑）
  const isConfirmDisabled = useMemo(() => {
    if (!nightInfo) return true;
    const roleId = nightInfo.effectiveRole.id;
    const actionType = nightInfo.effectiveRole.nightActionType;
    const phase = gamePhase;
    if (roleId === "fortune_teller" && selectedActionTargets.length !== 2) return true;
    if (roleId === "imp" && phase !== "firstNight" && actionType !== "none" && selectedActionTargets.length !== 1) return true;
    if (roleId === "poisoner" && actionType !== "none" && selectedActionTargets.length !== 1) return true;
    return false;
  }, [nightInfo, gamePhase, selectedActionTargets, hasUsedAbility, seats]);

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

  return (
    <>
    <GameLayout
      leftPanel={
        <div className="w-full h-full p-4">
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
          scriptText={nightInfo?.speak || (gamePhase === 'day' ? '白天讨论阶段' : gamePhase === 'dusk' ? '黄昏处决阶段' : undefined)}
          guidancePoints={nightInfo?.guide ? [nightInfo.guide] : []}
          selectedPlayers={selectedActionTargets}
                    seats={seats}
          nightInfo={nightInfo}
          primaryAction={
            (gamePhase === 'firstNight' || gamePhase === 'night')
              ? {
                  label: '确认 & 下一步',
                  onClick: handleConfirmAction,
                  disabled: isConfirmDisabled,
                  variant: 'primary' as const,
                }
              : gamePhase === 'check'
              ? {
                  label: '确认无误，入夜',
                  onClick: () => nightLogic.startNight(true),
                  disabled: seats.some(s => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk')),
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
        contextMenu={contextMenu}
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

