"use client";

import { useMemo, useCallback } from "react";
import { roles, Role, Seat, typeLabels, typeColors, typeBgColors } from "../../../app/data";
import { type DayAbilityConfig } from "../../hooks/useGameController";
import { useRoleAction } from "../../hooks/useRoleAction";
import GameStageWrapper from "../../components/GameStage";
import { GameHeader } from "./info/GameHeader";
import { LogViewer } from "./info/LogViewer";
import { ControlPanel } from "../ControlPanel";
import { GameModals } from "./GameModals";
import { GameBoard } from "./GameBoard";

interface GameStageProps {
  controller: ReturnType<typeof import("../../hooks/useGameController").useGameController>;
}

export default function GameStage({ controller }: GameStageProps) {
  // Destructure all needed values from controller
  const {
    // State
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
    
    // Refs
    seatContainerRef,
    seatRefs,
    fakeInspectionResultRef,
    consoleContentRef,
    currentActionTextRef,
    longPressTimerRef,
    longPressTriggeredRef,
    checkLongPressTimerRef,
    
    // Setters
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
    
    // Functions
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
  } = controller;

  const { executeAction } = useRoleAction();

  // Local computed values
  const seatScale = seats.length <= 9 ? 1.3 : 1;
  const currentNightNumber = gamePhase === 'firstNight' ? 1 : nightCount;
  const currentWakeSeat = nightInfo ? seats.find(s => s.id === nightInfo.seat.id) : null;
  const nextWakeSeatId = (gamePhase === 'firstNight' || gamePhase === 'night') && currentWakeIndex + 1 < wakeQueueIds.length ? wakeQueueIds[currentWakeIndex + 1] : null;
  const nextWakeSeat = nextWakeSeatId !== null ? seats.find(s => s.id === nextWakeSeatId) : null;
  const getDisplayRole = (seat: Seat | null | undefined) => {
    if (!seat) return null;
    const base = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
    return base;
  };
  const currentWakeRole = getDisplayRole(currentWakeSeat);
  const nextWakeRole = getDisplayRole(nextWakeSeat);

  // Local functions

  const closeNightOrderPreview = useCallback(() => {
    controller.setPendingNightQueue(null);
    controller.setNightOrderPreview([]);
    controller.setShowNightOrderModal(false);
    controller.setNightQueuePreviewTitle("");
  }, [controller]);


  const isConfirmDisabled = useMemo(() => {
    if (!nightInfo) return true;
    // Check for modals - these would need to come from controller
    const roleId = nightInfo.effectiveRole.id;
    const actionType = nightInfo.effectiveRole.nightActionType;
    const phase = gamePhase;
    if (roleId === 'fortune_teller' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'imp' && phase !== 'firstNight' && actionType !== 'none' && selectedActionTargets.length !== 1) return true;
    if (roleId === 'poisoner' && actionType !== 'none' && selectedActionTargets.length !== 1) return true;
    return false;
  }, [nightInfo, gamePhase, selectedActionTargets, hasUsedAbility, seats]);

  const confirmNightOrderPreview = useCallback(() => {
    if (!controller.pendingNightQueue) {
      controller.setShowNightOrderModal(false);
      return;
    }
    nightLogic.finalizeNightStart(controller.pendingNightQueue, true);
  }, [controller, nightLogic]);

  const openContextMenuForSeat = (seatId: number, anchorMode: 'seat' | 'center' = 'seat') => {
    const containerRect = seatContainerRef.current?.getBoundingClientRect();
    const seatRect = seatRefs.current[seatId]?.getBoundingClientRect();
    let targetX = 0;
    let targetY = 0;
    if (anchorMode === 'center' && containerRect) {
      targetX = containerRect.left + containerRect.width / 2;
      targetY = containerRect.top + containerRect.height / 2;
    } else {
      targetX = seatRect ? seatRect.left + seatRect.width / 2 : 0;
      targetY = seatRect ? seatRect.top + seatRect.height / 2 : 0;
    }
    if (containerRect) {
      const menuW = 192;
      const menuH = 240;
      const pad = 6;
      const minX = containerRect.left + pad + menuW / 2;
      const maxX = containerRect.right - pad - menuW / 2;
      const minY = containerRect.top + pad + menuH / 2;
      const maxY = containerRect.bottom - pad - menuH / 2;
      targetX = Math.min(Math.max(targetX, minX), maxX);
      targetY = Math.min(Math.max(targetY, minY), maxY);
    }
    setContextMenu({ x: targetX, y: targetY, seatId });
  };

  const handleContextMenu = (e: React.MouseEvent, seatId: number) => { 
    e.preventDefault(); 
    const seat = seats.find(s => s.id === seatId);
    if (gamePhase === 'check' && seat?.role?.id === 'drunk') {
      setShowDrunkModal(seatId);
      return;
    }
    if (isPortrait) {
      openContextMenuForSeat(seatId, 'center');
    } else {
      setContextMenu({x:e.clientX,y:e.clientY,seatId}); 
    }
  };

  const handleTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const existingTimer = longPressTimerRef.current.get(seatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    setLongPressingSeats(prev => new Set(prev).add(seatId));
    longPressTriggeredRef.current.delete(seatId);
    const timer = setTimeout(() => {
      const seat = seats.find(s => s.id === seatId);
      if (gamePhase === 'check' && seat?.role?.id === 'drunk') {
        setShowDrunkModal(seatId);
      } else {
        openContextMenuForSeat(seatId, 'center');
      }
      longPressTriggeredRef.current.add(seatId);
      longPressTimerRef.current.delete(seatId);
      setLongPressingSeats(prev => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }, 200);
    longPressTimerRef.current.set(seatId, timer);
  };

  const handleTouchEnd = (e: React.TouchEvent, seatId: number) => {
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
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  const handleTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
    }
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  const canToggleRedHerring = useCallback((seatId: number) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat || !seat.role) return false;
    if (['minion', 'demon'].includes(seat.role.type)) return false;
    const hasFortuneTeller = seats.some(s => s.role?.id === 'fortune_teller');
    return hasFortuneTeller;
  }, [seats]);

  const clearCheckLongPressTimer = () => {
    if (checkLongPressTimerRef.current) {
      clearTimeout(checkLongPressTimerRef.current);
      checkLongPressTimerRef.current = null;
    }
  };

  const handleCheckTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canToggleRedHerring(seatId)) return;
    clearCheckLongPressTimer();
    checkLongPressTimerRef.current = setTimeout(() => {
      toggleStatus('redherring', seatId);
      clearCheckLongPressTimer();
    }, 200);
  };

  const handleCheckTouchEnd = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    clearCheckLongPressTimer();
  };

  const handleCheckTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    clearCheckLongPressTimer();
  };

  const handleCheckContextMenu = (e: React.MouseEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canToggleRedHerring(seatId)) return;
    toggleStatus('redherring', seatId);
  };

  const handleMenuAction = (action: string) => {
    if(!contextMenu) return;
    if(action==='nominate') { 
      if (gamePhase !== 'dusk') {
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'nominate', sourceId: contextMenu.seatId });
    } else if(action==='slayer') {
      const shooter = seats.find(s => s.id === contextMenu.seatId);
      if (!shooter || shooter.hasUsedSlayerAbility) {
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'slayer', sourceId: contextMenu.seatId });
    } else if (action === 'damselGuess') {
      const seat = seats.find(s => s.id === contextMenu.seatId);
      const hasDamsel = seats.some(s => s.role?.id === 'damsel');
      // damselGuessUsedBy would need to come from controller
      if (!seat || seat.role?.type !== 'minion' || seat.isDead || !hasDamsel || gamePhase !== 'day') {
        setContextMenu(null);
        return;
      }
      setShowDamselGuessModal({ minionId: contextMenu.seatId, targetId: null });
    }
    setContextMenu(null);
  };

  // Render the game UI
  return (
    <div 
      className="fixed inset-0 text-white overflow-hidden"
      style={{
        background: gamePhase==='day'?'rgb(12 74 110)':gamePhase==='dusk'?'rgb(28 25 23)':'rgb(3 7 18)'
      }}
      onClick={()=>{setContextMenu(null);setShowMenu(false);}}
    >
      <GameStageWrapper>
        <div className="w-full h-full flex flex-col bg-slate-950 text-white">
          <GameHeader
            onShowGameRecords={() => setShowGameRecordsModal(true)}
            onShowReview={() => setShowReviewModal(true)}
            onShowRoleInfo={() => setShowRoleInfoModal(true)}
            onSwitchScript={handleSwitchScript}
            onRestart={handleRestart}
            showMenu={showMenu}
            onToggleMenu={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            onCloseMenu={() => setShowMenu(false)}
          />

          <div className="flex-1 flex min-h-0">
            <GameBoard
              seats={seats}
              gamePhase={gamePhase}
              timer={timer}
              nightInfo={nightInfo}
              selectedActionTargets={selectedActionTargets}
              isPortrait={isPortrait}
              seatScale={seatScale}
              longPressingSeats={longPressingSeats}
              seatContainerRef={seatContainerRef}
              seatRefs={seatRefs}
              handleSeatClick={onSeatClick}
              handleContextMenu={handleContextMenu}
              handleTouchStart={handleTouchStart}
              handleTouchEnd={handleTouchEnd}
              handleTouchMove={handleTouchMove}
              handleGlobalUndo={handleGlobalUndo}
              getSeatPosition={getSeatPosition}
              getDisplayRoleType={getDisplayRoleType}
              formatTimer={formatTimer}
              setSeatRef={(id, el) => { seatRefs.current[id] = el; }}
              typeColors={typeColors}
              setShowSpyDisguiseModal={setShowSpyDisguiseModal}
            />

            <aside className="w-[450px] h-full border-l border-white/10 bg-slate-900/50 flex flex-col relative z-20 shrink-0 overflow-hidden">
              <div className="px-4 py-2 border-b border-white/10 shrink-0 h-16 flex items-center">
                <h2 className="text-lg font-bold text-purple-300"> 说书人控制台</h2>
              </div>
              {nightInfo && (
                <div className="px-4 py-2 border-b border-white/10 bg-slate-900/50 shrink-0">
                  <span 
                    ref={currentActionTextRef}
                    className="text-sm font-bold text-white block text-center"
                  >
                    当前是第{currentNightNumber}夜轮到
                    <span className="text-yellow-300">
                      {nightInfo.seat.id+1}号{currentWakeRole?.name || nightInfo.effectiveRole.name}
                    </span>
                    行动
                    <br />
                    下一个将
                    <span className="text-cyan-300">
                      {nextWakeSeat && nextWakeRole ? `${nextWakeSeat.id+1}号(${nextWakeRole.name})` : '本夜结束'}
                    </span>
                  </span>
                </div>
              )}
              <div ref={consoleContentRef} className="flex-1 overflow-y-auto p-4 text-sm min-h-0">
                {gamePhase==='day' && (
                  <div className="mb-4 p-3 bg-gray-800/50 border border-yellow-500/30 rounded-lg text-sm text-gray-300 leading-relaxed">
                    <p className="mb-2 font-bold text-yellow-400 text-sm"> 说书人提示</p>
                    <p className="mb-2 text-xs">你的目标是主持一场有趣好玩且参与度高的游戏</p>
                    <p className="mb-2 text-xs">有些事你可以做但不意味着你应该去做你是否只顾自己取乐而给玩家们添乱你是否正在牺牲玩家的乐趣来放纵自己比如说当小恶魔在夜里将自己杀死时你"可以"将陌客当作是爪牙并让他因此变成一个善良的小恶魔但这并不意味着这样做是有趣或平衡的比如说可以"说服一名迷惑的善良阵营玩家告诉他他是邪恶阵营的但这并不意味着玩家在得知真相后会享受这个过程又比如说你"可以"给博学者提供完全没用的信息但显然提供有趣且独特的信息会更好</p>
                    <p className="mb-2 text-xs">作为说书人你在每一局游戏当中都需要做出很多有趣的决定而这每一个决定的目的都应该是使游戏变得更好玩为大家带来更多乐趣这通常意味着你需要给善良阵营制造尽可能多的混乱将他们引入歧途因为这对所有人来说都是有趣的但请牢记在心维持游戏的公平性是同样重要的你主持游戏是为了让玩家都能够享受到游戏中的精彩</p>
                  </div>
                )}
                {gamePhase==='day' && (() => {
                  const dayAbilityConfigs: DayAbilityConfig[] = [
                    {
                      roleId: 'savant_mr',
                      title: '博学者每日提问',
                      description: '每个白天一次向说书人索取一真一假的两条信息',
                      usage: 'daily',
                      logMessage: (seat: Seat) => `${seat.id+1}号(博学者) 使用今日提问，请准备一真一假两条信息`
                    },
                    {
                      roleId: 'amnesiac',
                      title: '失意者每日猜测',
                      description: '每个白天一次向说书人提交本回合的猜测并获得反馈',
                      usage: 'daily',
                      logMessage: (seat: Seat) => `${seat.id+1}失意 提交今日猜测请给出反馈`
                    },
                    {
                      roleId: 'fisherman',
                      title: '渔夫灵感',
                      description: '每局一次向说书人索取获胜建议',
                      usage: 'once',
                      logMessage: (seat: Seat) => `${seat.id+1}渔夫) 使用一次性灵感请提供获胜建议`
                    },
                    {
                      roleId: 'engineer',
                      title: '工程师改造',
                      description: '每局一次改造恶魔或爪牙阵营，请手动选择变更',
                      usage: 'once',
                      logMessage: (seat: Seat) => `${seat.id+1}工程 启动改装请根据需求手动调整恶爪牙`
                    },
                    {
                      roleId: 'lunatic_mr',
                      title: '精神病患者日杀',
                      description: '提名前公开杀死一名玩家处决时需与提名者猜拳决定生死',
                      usage: 'daily',
                      actionType: 'lunaticKill',
                      logMessage: (seat: Seat) => `${seat.id+1}号(精神病患者) 准备发动日间杀人`
                    }
                  ];
                  const entries = seats
                    .filter(s => s.role && dayAbilityConfigs.some(c => c.roleId === s.role!.id))
                    .map(seat => {
                      const config = dayAbilityConfigs.find(c => c.roleId === seat.role?.id);
                      return config ? { seat, config } : null;
                    })
                    .filter((v): v is { seat: Seat; config: DayAbilityConfig } => !!v);
                  if (entries.length === 0) return null;
                  return (
                    <div className="mb-4 p-3 bg-gray-800/40 border border-blue-500/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-blue-300"> 白天主动技能</p>
                        <span className="text-xs text-gray-400">每日/一次性能力快速触发</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {entries.map(({ seat, config }) => {
                          const used = config.usage === 'once'
                            ? hasUsedAbility(config.roleId, seat.id)
                            : hasUsedDailyAbility(config.roleId, seat.id);
                          const disabled = seat.isDead || used;
                          const statusLabel = seat.isDead
                            ? '已死'
                            : used
                              ? (config.usage === 'once' ? '已用' : '今日已用')
                              : '可使用';
                          return (
                            <div key={`${config.roleId}-${seat.id}`} className="p-3 border border-gray-700 rounded-lg bg-gray-900/40">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-bold text-white">{seat.id+1}{seat.role?.name}</div>
                                <span className="text-xs text-gray-400">{statusLabel}</span>
                              </div>
                              <p className="text-xs text-gray-400 mb-2 leading-relaxed">{config.description}</p>
                              <button
                                onClick={() => handleDayAbilityTrigger(seat, config)}
                                disabled={disabled}
                                className={`w-full py-2 rounded-lg text-sm font-bold transition ${
                                  disabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
                                }`}
                              >
                                触发
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {dayAbilityLogs.length > 0 && (
                        <div className="mt-3 space-y-1 text-xs text-gray-300">
                          <div className="font-bold text-blue-200">今日反馈记录</div>
                          {dayAbilityLogs
                            .filter(l => l.day === nightCount)
                            .map((l, idx) => (
                              <div key={`${l.roleId}-${l.id}-${idx}`} className="px-2 py-1 bg-gray-800/60 rounded border border-gray-700">
                                {l.id+1}{getSeatRoleId(seats.find(s=>s.id===l.id)) === l.roleId ? '' : ''}{roles.find(r=>r.id===l.roleId)?.name || l.roleId}{l.text}
                              </div>
                            ))}
                          {dayAbilityLogs.filter(l => l.day === nightCount).length === 0 && (
                            <div className="text-gray-500">尚无记录</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {gamePhase==='day' && !damselGuessed && seats.some(s=>s.role?.type==='minion' && !s.isDead) && seats.some(s=>s.role?.id==='damsel') && (
                  <div className="mb-4 p-3 bg-gray-800/40 border border-pink-500/40 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-pink-300"> 爪牙猜测落难少女</p>
                      <span className="text-xs text-gray-400">每名爪牙每局一次猜中则邪恶立刻获胜</span>
                    </div>
                    <button
                      onClick={()=>setShowDamselGuessModal({ minionId: null, targetId: null })}
                      className="w-full py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm"
                    >
                      发起猜测
                    </button>
                  </div>
                )}
                {gamePhase==='day' && shamanKeyword && !shamanTriggered && (
                  <div className="mb-4 p-3 bg-gray-800/40 border border-purple-500/40 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-purple-300"> 灵言师关键词已被说出</p>
                      <span className="text-xs text-gray-400">选择第一个说出关键词的善良玩</span>
                    </div>
                    <button
                      onClick={()=>setShowShamanConvertModal(true)}
                      className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm"
                    >
                      触发阵营转换
                    </button>
                  </div>
                )}
                
                {gamePhase==='check' && (
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">核对身份</h2>
                    {autoRedHerringInfo && (
                      <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-500 text-red-200 font-semibold">
                         红罗刹自动分配{autoRedHerringInfo}
                      </div>
                    )}
                    {selectedScript && (
                      <div className="mb-4 px-4 py-3 rounded-lg bg-gray-800/80 border border-yellow-500/70 text-left text-sm text-gray-100 space-y-1">
                        <div className="font-bold text-yellow-300 mb-1"> 夜晚行动说明({selectedScript.name})</div>
                        {(() => {
                          const scriptRoles = roles.filter(r => {
                            if (selectedScript.id === 'trouble_brewing') return !r.script;
                            if (selectedScript.id === 'bad_moon_rising') return r.script === '暗月初升';
                            if (selectedScript.id === 'sects_and_violets') return r.script === '梦陨春宵';
                            if (selectedScript.id === 'midnight_revelry') return r.script === '夜半狂欢';
                            return false;
                          });
                          const onlyFirst = scriptRoles.filter(r => r.firstNight && !r.otherNight);
                          const onlyOther = scriptRoles.filter(r => !r.firstNight && r.otherNight);
                          const bothNights = scriptRoles.filter(r => r.firstNight && r.otherNight);
                          const passive = scriptRoles.filter(r => !r.firstNight && !r.otherNight);
                          const renderLine = (label: string, list: typeof scriptRoles) => {
                            if (!list.length) return null;
                            return (
                              <div>
                                <span className="font-semibold">{label}</span>
                                <span className="text-gray-300">
                                  {list.map(r => r.name).join('、')}
                                </span>
                              </div>
                            );
                          };
                          return (
                            <>
                              {renderLine('只在首夜被唤醒的角色', onlyFirst)}
                              {renderLine('只在之后夜晚被唤醒的角色', onlyOther)}
                              {renderLine('首夜和之后夜晚都会被唤醒的角色', bothNights)}
                              {renderLine('从不在夜里被唤醒但始终生效的角色', passive)}
                            </>
                          );
                        })()}
                        <div className="text-xs text-gray-400 mt-1">
                          提示若某角色今晚未被叫醒通常是因为规则只在首夜或之后夜晚才叫醒而非程序漏掉
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-800 p-4 rounded-xl text-left text-base space-y-3 max-h-[80vh] overflow-y-auto check-identity-scrollbar">
                      {seats.filter(s=>s.role).map(s=>{
                        const displayRole = s.role?.id === 'drunk' && s.charadeRole ? s.charadeRole : s.role;
                        const displayName = displayRole?.name || '';
                        const canRedHerring = canToggleRedHerring(s.id);
                        return (
                          <div 
                            key={s.id} 
                            className="flex flex-col gap-1 border-b border-gray-700 pb-2 select-none"
                            style={{ 
                              WebkitUserSelect: 'none', 
                              userSelect: 'none',
                              WebkitTouchCallout: 'none',
                              touchAction: 'manipulation',
                              WebkitTapHighlightColor: 'transparent',
                            }}
                            onContextMenu={(e)=>handleCheckContextMenu(e, s.id)}
                            onTouchStart={(e)=>handleCheckTouchStart(e, s.id)}
                            onTouchEnd={(e)=>handleCheckTouchEnd(e, s.id)}
                            onTouchMove={(e)=>handleCheckTouchMove(e, s.id)}
                          >
                            <div className="flex justify-between">
                              <span>{s.id+1}</span>
                              <span className={s.role?.type==='demon' ? 'text-red-500 font-bold' : ''}>
                                {displayName}
                                {s.role?.id==='drunk' && <span className="text-gray-400 text-sm">(酒鬼)</span>}
                                {s.isRedHerring && ' [红罗刹]'}
                                {!canRedHerring && s.isRedHerring && <span className="text-xs text-gray-500 ml-1">(仅占卜师在场可更改)</span>}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] text-gray-300">
                              {s.statusDetails?.length ? (
                                s.statusDetails.map(st => (
                                  <span key={st} className={`px-2 py-0.5 rounded bg-gray-700 text-yellow-300 border border-gray-600 ${st.includes('投毒') ? 'whitespace-nowrap' : ''}`}>{st}</span>
                                ))
                              ) : (
                                <span className="text-gray-500">无特殊状态</span>
                              )}
                              {s.isDead && (
                                <button
                                  type="button"
                                  onClick={() => setSeats(p => p.map(x => x.id === s.id ? { ...x, hasGhostVote: x.hasGhostVote === false ? true : false } : x))}
                                  className={`px-2 py-0.5 rounded border text-[11px] ${
                                    s.hasGhostVote === false
                                      ? 'bg-gray-700 border-gray-600 text-gray-400'
                                      : 'bg-indigo-900/60 border-indigo-500 text-indigo-100'
                                  }`}
                                  title="死者票点击切换已未用"
                                >
                                  死者票{(s.hasGhostVote === false) ? '已用' : ''}
                                </button>
                              )}
                              {s.hasUsedSlayerAbility && (
                                <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-700">猎手已用</span>
                              )}
                              {s.hasUsedVirginAbility && (
                                <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700">处女已失能</span>
                              )}
                              {s.hasAbilityEvenDead && (
                                <span className="px-2 py-0.5 rounded bg-green-900/60 text-green-200 border border-green-700">死而有</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {(gamePhase==='firstNight'||gamePhase==='night') && showMinionKnowDemonModal ? (() => {
                  const minionSeats = seats.filter(s => s.role?.type === 'minion').map(s => s.id + 1);
                  const minionSeatsText = minionSeats.length > 0 ? minionSeats.join('号和') + '号' : '';
                  return (
                  <div className="space-y-4 animate-fade-in mt-10">
                    <div className="p-4 rounded-xl border-2 bg-purple-900/20 border-purple-500">
                      <div className="text-xl font-bold text-purple-300 mb-4"> 爪牙集体的行动</div>
                      <div className="mb-2 text-sm text-gray-400 font-bold uppercase"> 指引</div>
                      <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">
                        现在请同时唤醒{minionSeatsText}爪牙告诉他们恶魔是{showMinionKnowDemonModal.demonSeatId + 1}号玩家
                      </p>
                      <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700 mb-4">
                        <div className="font-semibold text-purple-300 mb-2">恶魔位置</div>
                        <div className="text-lg font-bold text-yellow-300">
                          {showMinionKnowDemonModal.demonSeatId + 1}号玩家是恶魔
                        </div>
                      </div>
                      <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">台词</div>
                      <p className="text-lg font-serif bg-black/40 p-3 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">
                        "现在请你一次性叫醒所有爪牙并指向恶魔恶魔在 {showMinionKnowDemonModal.demonSeatId + 1} 号确认所有爪牙都知道恶魔的座位号后再让他们一起闭眼
                      </p>
                      <div className="mt-6">
                        <button
                          onClick={() => {
                            setShowMinionKnowDemonModal(null);
                            if(currentWakeIndex < wakeQueueIds.length - 1) { 
                              setCurrentWakeIndex(p => p + 1); 
                              setInspectionResult(null);
                              setSelectedActionTargets([]);
                              fakeInspectionResultRef.current = null;
                            } else {
                              if(deadThisNight.length > 0) {
                                const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
                                setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
                              } else {
                                setShowNightDeathReportModal("昨天是个平安夜");
                              }
                            }
                          }}
                          className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-500 transition"
                        >
                          已告知继续
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })() : (gamePhase==='firstNight'||gamePhase==='night') && nightInfo ? (
                  <div className="space-y-4 animate-fade-in mt-10">
                    <div className={`p-4 rounded-xl border-2 ${
                      currentHint.isPoisoned?'bg-red-900/20 border-red-500':'bg-gray-800 border-gray-600'
                    }`}>
                      {currentHint.isPoisoned && (
                        <div className="text-red-400 font-bold mb-3 text-base flex items-center gap-2">
                           {currentHint.reason}
                        </div>
                      )}
                      <div className="mb-2 text-sm text-gray-400 font-bold uppercase"> 指引</div>
                      <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">{currentHint.guide}</p>
                      <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">台词</div>
                      <p className="text-lg font-serif bg-black/40 p-3 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">
                        {currentHint.speak}
                      </p>
                    </div>
                    
                    {nightInfo.effectiveRole.nightActionType === 'spy_info' && (
                      <div className="bg-black/50 p-3 rounded-xl h-[180%] overflow-y-auto text-xs flex gap-3">
                        <div className="w-1/2">
                          <h4 className="text-purple-400 mb-2 font-bold border-b pb-1 text-sm">魔典</h4>
                          {seats.filter(s=>s.role).map(s => (
                            <div key={s.id} className="py-0.5 border-b border-gray-700 flex justify-between">
                              <span>{s.id+1}</span>
                              <span className={s.role?.type==='demon' ? 'text-red-500' : ''}>
                                {s.role?.name}
                              </span>
    </div>
                          ))}
                        </div>
                        <LogViewer logs={controller.gameLogs} />
                      </div>
                    )}
                    
                    {nightInfo.effectiveRole.nightActionType!=='spy_info' && nightInfo.effectiveRole.nightActionType!=='none' && (
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        {seats.filter(s=>{
                          if (nightInfo.effectiveRole.id === 'fortune_teller') {
                            return s.role !== null;
                          }
                          if (nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
                            return s.role && !s.isDead;
                          }
                          if (nightInfo.effectiveRole.id === 'zombuul') {
                            if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
                              return true;
                            }
                            return s.role && !s.isDead;
                          }
                          return s.role && (nightInfo.effectiveRole.id==='ravenkeeper' || !s.isDead);
                        }).map(s=>(
                          <button 
                            key={s.id} 
                            onClick={()=>toggleTarget(s.id)} 
                            disabled={isTargetDisabled(s)} 
                            className={`p-3 border-2 rounded-lg text-sm font-bold transition-all ${
                              selectedActionTargets.includes(s.id)
                                ? 'bg-green-600 border-white scale-105 shadow-lg ring-4 ring-green-500'
                                : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                            } ${isTargetDisabled(s) ? 'opacity-30 cursor-not-allowed':''}`}
                          >
                            [{s.id+1}] {s.role?.name}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {inspectionResult && (
                      <div
                        key={inspectionResultKey}
                        className="bg-blue-600 p-4 rounded-xl text-center font-bold text-2xl shadow-2xl mt-4 animate-bounce"
                      >
                        {inspectionResult}
                      </div>
                    )}
                  </div>
                ) : ((gamePhase==='firstNight'||gamePhase==='night') && !nightInfo && (
                  <div className="text-center text-gray-500 mt-20 text-xl">正在计算行动...</div>
                ))}
                
                {gamePhase==='dusk' && (
                  <div className="mt-4 bg-gray-800 p-3 rounded-xl">
                    <h3 className="text-lg font-bold mb-2 text-orange-400"> 处决</h3>
                    {seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)).map((s,i)=>(
                      <div 
                        key={s.id} 
                        className={`flex justify-between p-2 border-b border-gray-600 ${
                          i===0 ? 'text-red-400 font-bold' : ''
                        }`}
                      >
                        <span>{s.id+1}{s.role?.name}</span>
                        <span>{s.voteCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
          
          <footer className="flex items-center justify-center h-20 border-t border-white/10 bg-slate-900/50 z-20 shrink-0">
            <ControlPanel
              gamePhase={gamePhase}
              seats={seats}
              currentWakeIndex={currentWakeIndex}
              history={history}
              isConfirmDisabled={isConfirmDisabled}
              evilTwinPair={evilTwinPair}
              remainingDays={remainingDays}
              setRemainingDays={setRemainingDays}
              cerenovusTarget={cerenovusTarget}
              nightCount={nightCount}
              onPreStartNight={handlePreStartNight}
              onStartNight={(isFirst) => nightLogic.startNight(isFirst)}
              onStepBack={handleStepBack}
              onConfirmAction={handleConfirmAction}
              onDayEndTransition={handleDayEndTransition}
              onExecuteJudgment={executeJudgment}
              onSetGamePhase={setGamePhase}
              onSetShowMadnessCheckModal={(show) => controller.setShowMadnessCheckModal(show)}
              onAddLog={addLog}
            />
          </footer>
        </div>
      </GameStageWrapper>

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
        groupedRoles={controller.groupedRoles}
        gameLogs={controller.gameLogs}
        gameRecords={controller.gameRecords}
        isPortrait={isPortrait}
        nightInfo={nightInfo}
        selectedActionTargets={selectedActionTargets}
        initialSeats={controller.initialSeats}
        nominationRecords={controller.nominationRecords}
        evilTwinPair={evilTwinPair && 'evilId' in evilTwinPair ? [evilTwinPair.evilId, evilTwinPair.goodId] : null}
        remainingDays={remainingDays}
        cerenovusTarget={cerenovusTarget ? (typeof cerenovusTarget === 'number' ? cerenovusTarget : cerenovusTarget.targetId) : null}
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
        handleMenuAction={handleMenuAction}
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
    </div>
  );
}

