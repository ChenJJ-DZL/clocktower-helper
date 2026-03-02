/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { motion } from "framer-motion";
import { useEffect, useCallback } from "react";
import { typeColors } from "./data";
import { NightHintState } from "../src/types/game";
import { useGameController } from "../src/hooks/useGameController";
import { GameActionsProvider } from "../src/contexts/GameActionsContext";
import PortraitLock from "../src/components/PortraitLock";
import { GameStage } from "../src/components/game/GameStage";

import { ScaleLayout } from "../src/components/layout/ScaleLayout";


// getSeatRoleId is now imported from useGameController

// cleanseSeatStatuses is now imported from useGameController


// isActionAbility, isActorDisabledByPoisonOrDrunk, addDrunkMark, isEvilForWinCondition,
// getDisplayRoleType, hasTeaLadyProtection, hasExecutionProof are now imported from useGameController


// --- 核心计算逻辑 ---
// calculateNightInfo 已迁移到 src/utils/nightLogic.ts
import { GameModals } from "@/src/components/game/GameModals";
import ScriptSelection from "@/src/components/game/setup/ScriptSelection";
import GameSetup from "@/src/components/game/setup/GameSetup";
import { GameLayout } from "@/src/components/game/GameLayout";
import { RoundTable } from "@/src/components/game/board/RoundTable";
import { useAudio } from "@/src/hooks/useAudio";

// ======================================================================
//  暗流涌动 / 暗流涌动剧本 / 游戏的第一部分
//  - 当前组件中除加载动画showIntroLoading / triggerIntroLoading 及对JSX)
//    之外的所有状态逻辑与界面均属于暗流涌动剧本游戏的第一部分的实现
//  - 未来若新增其他剧本可通过拆分/复用这里的结构作为参考
// ======================================================================
export default function Home() {
  // ===========================
  //      使用 useGameController Hook 获取所有状态和逻辑
  // ===========================
  const controller = useGameController();
  const { playSound } = useAudio();
  // 仅解构本文件直接使用的变量；其余通过 controller={controller} 传递给 GameActionsProvider
  const {
    // 基础状态 & UI
    mounted, setMounted, showIntroLoading, setIsPortrait,
    gamePhase, setGamePhase, seats, setGameLogs,
    selectedScript, setSelectedScript, nightCount,
    deadThisNight, gameLogs,
    // Modal & Setup
    baronSetupCheck, setBaronSetupCheck, ignoreBaronSetup, setIgnoreBaronSetup,
    compositionError, setCompositionError,
    currentModal, setCurrentModal, contextMenu, setContextMenu, setShowMenu,
    // 夜晚行动
    wakeQueueIds, setWakeQueueIds, currentWakeIndex, setCurrentWakeIndex,
    selectedActionTargets, setSelectedActionTargets, setInspectionResult,
    currentHint, setCurrentHint, nightInfo,
    // 白天事件（仅 effect 中引用的变量）
    spyDisguiseMode, spyDisguiseProbability,
    fangGuConverted, jugglerGuesses, evilTwinPair, usedOnceAbilities,
    witchActive, cerenovusTarget, witchCursedId, todayExecutedId,
    setIsVortoxWorld, setBalloonistKnownTypes, setTimer,
    // Refs
    introTimeoutRef, hintCacheRef, fakeInspectionResultRef,
    consoleContentRef, currentActionTextRef,
    longPressTimerRef, longPressTriggeredRef, checkLongPressTimerRef, seatRefs,
    // Helper functions
    resetRegistrationCache, addLogWithDeduplication, continueToNextAction,
    saveHistory, onSeatClick,
    selectedRole, setSelectedRole,
    handleBaronAutoRebalance, handlePreStartNight, proceedToCheckPhase,
    filteredGroupedRoles, getCompositionStatus, getBaronStatus,
    validateCompositionSetup, validateBaronSetup,
    getDisplayRoleForSeat,
  } = controller;

  // [REFACTOR] seatsRef and gameStateRef sync removed - all state reads go through Context

  // --- Effects ---
  // Note: 初始化逻辑已迁移到 useGameController，这里不再需要

  useEffect(() => {
    setMounted(true);
    return () => {
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
      }
    };
  }, []);

  // Timer is now managed in useGameController

  // 间谍/隐士查验结果在同一夜晚保持一致伪装参数变化时刷新缓
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}-disguise`);
    }
  }, [spyDisguiseMode, spyDisguiseProbability, resetRegistrationCache, gamePhase, nightCount]);

  // 进入新的夜晚阶段时重置同夜查验结果缓存保证当晚内一致跨夜独
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}`);
    }
  }, [gamePhase, nightCount, resetRegistrationCache]);

  // 检测设备方向和屏幕尺寸
  useEffect(() => {
    if (!mounted) return;

    const checkOrientation = () => {
      // 检测是否为竖屏高度大于宽度或者使用媒体查
      const isPortraitMode = window.innerHeight > window.innerWidth ||
        window.matchMedia('(orientation: portrait)').matches;
      setIsPortrait(isPortraitMode);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [mounted]);

  // [REFACTOR] seatsRef sync effect removed

  // 自动识别当前是否处于涡流恶魔环境镇民信息应为假
  useEffect(() => {
    const aliveVortox = seats.some(
      s => !s.isDead && ((s.role?.id === 'vortox') || (s.isDemonSuccessor && s.role?.id === 'vortox'))
    );
    setIsVortoxWorld(aliveVortox);
  }, [seats]);

  // 预留的一次配对状态后续在梦陨春宵角色逻辑中使
  useEffect(() => {
    // 目前仅用于保持状态引用防止未使用警
  }, [fangGuConverted, jugglerGuesses, evilTwinPair, usedOnceAbilities, witchActive, cerenovusTarget, witchCursedId, todayExecutedId]);

  // 清理已离场的气球驾驶员记
  useEffect(() => {
    setBalloonistKnownTypes(prev => {
      const activeIds = new Set(seats.filter(s => s.role?.id === 'balloonist').map(s => s.id));
      const next: Record<number, string[]> = {};
      activeIds.forEach(id => {
        if (prev[id]) next[id] = prev[id];
      });
      return next;
    });
  }, [seats]);

  useEffect(() => {
    if (nightInfo) {
      // 生成缓存 key用上一时恢hint不重新生成
      const hintKey = `${gamePhase}-${currentWakeIndex}-${nightInfo?.seat?.id}`;

      // 检查缓存中是否有该角色hint用上一时恢复
      const cachedHint = hintCacheRef.current.get(hintKey);
      if (cachedHint) {
        setCurrentHint(cachedHint);
        if (cachedHint.fakeInspectionResult) {
          fakeInspectionResultRef.current = cachedHint.fakeInspectionResult;
        }
        return; // 使用缓存hint不重新计算
      }

      // 没有缓存重新计hint
      let fakeResult = currentHint.fakeInspectionResult;
      // 占卜师的假信息现在在玩家选择后根据真实结果生成toggleTarget 函数中
      // 这里不再预先生成假信息因为需要先知道玩家选择了谁才能计算真实结果
      if (nightInfo.effectiveRole.id !== 'fortune_teller' || !nightInfo.isPoisoned) {
        fakeInspectionResultRef.current = null;
      }

      const newHint: NightHintState = {
        isPoisoned: nightInfo.isPoisoned,
        reason: nightInfo.reason,
        guide: nightInfo.guide,
        speak: nightInfo.speak,
        fakeInspectionResult: fakeResult
      };

      // 气球驾驶员自动记录日志被动信息技能
      if (nightInfo.effectiveRole.id === 'balloonist' && nightInfo.guide.includes('你得') && !nightInfo.isPoisoned) {
        // guide 中提取信息格式" 你得X号角色类型镇
        const match = nightInfo.guide.match(/你得(\d+)号，角色类型：(.+)/);
        if (match) {
          const seatNum = match[1];
          const typeName = match[2].trim();
          addLogWithDeduplication(
            `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(气球驾驶员) 得知 ${seatNum}号，角色类型：${typeName}`,
            nightInfo?.seat?.id ?? 0,
            '气球驾驶员'
          );
          // 记录已知类型防止重
          setBalloonistKnownTypes(prev => {
            const seatId = nightInfo?.seat?.id ?? 0;
            const known = prev[seatId] || [];
            if (known.includes(typeName)) return prev;
            return { ...prev, [seatId]: [...known, typeName] };
          });
        }
      }

      // 保存到缓
      hintCacheRef.current.set(hintKey, newHint);
      setCurrentHint(newHint);

      if (selectedActionTargets.length > 0 && seats.find(s => s.id === selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
        setSelectedActionTargets([]);
        setInspectionResult(null);
        fakeInspectionResultRef.current = null;
      }
    }
  }, [currentWakeIndex, gamePhase, nightInfo, seats, selectedActionTargets, currentHint.fakeInspectionResult, gameLogs, addLogWithDeduplication, wakeQueueIds]);

  // 夜晚阶段切换角色时自动滚动控制台到顶部
  useEffect(() => {
    if ((gamePhase === 'firstNight' || gamePhase === 'night') && consoleContentRef.current) {
      consoleContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentWakeIndex, gamePhase]);

  // 动态调当前是X号X角色在行的字体大小确保不超出容
  const adjustActionTextSize = useCallback(() => {
    if (currentActionTextRef.current && nightInfo) {
      const textElement = currentActionTextRef.current;
      const container = textElement.parentElement;
      if (!container) return;

      // 重置字体大小
      textElement.style.fontSize = '';

      // 获取容器宽度和文本宽
      const containerWidth = container.offsetWidth;
      const textWidth = textElement.scrollWidth;

      // 如果文本超出容器则缩小字体
      if (textWidth > containerWidth) {
        const baseFontSize = 30; // text-3xl 对应的大0px
        const scale = containerWidth / textWidth;
        const newFontSize = Math.max(baseFontSize * scale * 0.95, 12); // 最2px留5%边距
        textElement.style.fontSize = `${newFontSize}px`;
      }
    }
  }, [nightInfo]);

  useEffect(() => {
    adjustActionTextSize();
    // 窗口大小改变时重新计
    window.addEventListener('resize', adjustActionTextSize);
    return () => {
      window.removeEventListener('resize', adjustActionTextSize);
    };
  }, [adjustActionTextSize, currentWakeIndex]);

  // 组件卸载时清理所有长按定时器
  useEffect(() => {
    return () => {
      longPressTimerRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      longPressTimerRef.current.clear();
      longPressTriggeredRef.current.clear();
      if (checkLongPressTimerRef.current) {
        clearTimeout(checkLongPressTimerRef.current);
        checkLongPressTimerRef.current = null;
      }
      seatRefs.current = {};
    };
  }, []);

  // 全局屏蔽系统默认的长按行为contextmenu文本选择等
  useEffect(() => {
    const preventDefault = (e: Event) => {
      // 阻止所有contextmenu事件（右键菜单）
      if (e.type === 'contextmenu') {
        // 如果是 setup 阶段，我们允许 contextmenu 事件传播，以便触发自定义菜单
        // 或者我们可以直接在这里判断，如果不在此处阻止，组件内部的 preventDefault 也会生效
        return;
      }
    };

    const preventTouchCallout = (e: TouchEvent) => {
      // 阻止触摸长按时的系统菜单
      // 注意这里不阻止所有touch事件只阻止可能导致系统菜单
      // 实际的触摸处理由各个组件的onTouchStart/End/Move处理
    };

    // 阻止全局contextmenu
    document.addEventListener('contextmenu', preventDefault, { passive: false, capture: true });

    // 阻止触摸长按时的系统行为通过CSS已处理这里作为额外保障
    document.addEventListener('touchstart', preventTouchCallout, { passive: true });
    document.addEventListener('touchmove', preventTouchCallout, { passive: true });
    document.addEventListener('touchend', preventTouchCallout, { passive: true });

    // 阻止文本选择通过CSS已处理这里作为额外保障
    document.addEventListener('selectstart', (e) => {
      e.preventDefault();
      return false;
    }, { passive: false });

    return () => {
      document.removeEventListener('contextmenu', preventDefault, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchstart', preventTouchCallout);
      document.removeEventListener('touchmove', preventTouchCallout);
      document.removeEventListener('touchend', preventTouchCallout);
      document.removeEventListener('selectstart', preventDefault);
    };
  }, []);

  // Note: 游戏结束时保存对局记录的逻辑已迁移到 useGameController

  // 检查游戏结束条逻辑已迁移到 useGameController 中的 checkGameOver

  // ======================================================================
  //  游戏流程 / 剧本流程 / 通用流程
  //  - 以下 : gamePhase 相关的状态函数和处理逻辑
  //    定义了当前剧本暗流涌动的整套通用流程
  //    准备阶(setup) 核对身份 (check) 首夜 (firstNight)
  //      白天 (day) 黄昏/处决 (dusk) 夜晚 (night)
  //      天亮结算 (dawnReport) 游戏结束 (gameOver)
  //  - 未来如果开发新的剧本可以整体复制 / 修改这一段流程代码
  //    作为新剧本的游戏流/ 剧本流程 / 通用流程模板
  // ======================================================================
  // --- Handlers ---
  // demonActionDisabled and isTargetDisabled moved to GameStage component

  // handleSeatClick logic moved to useGameController as onSeatClick - using imported version
  const handleSeatClick = onSeatClick;

  // getStandardComposition is now imported from useGameController

  // validateBaronSetup and validateCompositionSetup are now imported from useGameController

  // proceedToCheckPhase is now imported from useGameController

  // closeNightOrderPreview moved to GameStage component

  // toggleTarget moved to GameStage component

  // handleConfirmAction moved to useGameController - using imported version

  // Note: 自动识别当前是否处于涡流环境逻辑已保留
  /*
  useEffect(() => {
    // [DELETED] Safeguard moved to useGameController.ts
  }, [gamePhase, nightInfo, wakeQueueIds, currentWakeIndex]);
  */

  // isConfirmDisabled moved to GameStage component

  // confirmNightOrderPreview moved to GameStage component

  // confirmKill moved to useGameController - using imported version

  // confirmMayorRedirect, confirmHadesiaKill, confirmMoonchildKill, confirmSweetheartDrunk, 
  // confirmKlutzChoice, confirmStorytellerDeath, confirmHadesia, confirmSaintExecution, 
  // cancelSaintExecution moved to useGameController - using imported versions

  // setHadesiaChoice moved to useGameController - using imported version

  // executeNomination, handleVirginGuideConfirm, handleDayAction, handleDayAbilityTrigger 
  // moved to useGameController - using imported versions

  // reviveSeat is now imported from useGameController

  // submitVotes moved to useGameController - using imported version

  // executeJudgment moved to useGameController - using imported version

  // 6. 确认处决结果后继续游
  // confirmExecutionResult and enterDuskPhase moved to useGameController - using imported versions

  // declareMayorImmediateWin, handleDayEndTransition moved to useGameController - using imported versions

  // resolveLunaticRps and confirmShootResult moved to useGameController - using imported versions

  // openContextMenuForSeat, handleContextMenu, handleTouchStart, handleTouchEnd, handleTouchMove moved to GameStage component
  // canToggleRedHerring, handleCheckTouchStart, handleCheckTouchEnd, handleCheckTouchMove, handleCheckContextMenu moved to GameStage component
  // handleMenuAction moved to GameStage component

  // toggleStatus moved to useGameController - using imported version

  // confirmRavenkeeperFake, confirmVirginTrigger moved to useGameController - using imported versions

  // 注意此函数已不再使用守鸦人的结果现在直接显示在控制台
  // 保留此函数仅为了兼容性但不会被调用
  // confirmRavenkeeperResult deleted (dead code)

  // handleRestart, confirmRestart, handleSwitchScript, handleNewGame 
  // moved to useGameController - using imported versions

  // executeAction from useRoleAction moved to GameStage component
  // seatScale, currentNightNumber, currentWakeSeat, nextWakeSeatId, nextWakeSeat, getDisplayRole, currentWakeRole, nextWakeRole moved to GameStage component

  // Day/Night transition sound effects
  useEffect(() => {
    if (gamePhase === 'day') {
      setTimer(480); // Default to 8 mins discussion
      playSound('day');
    } else if (gamePhase === 'night' || gamePhase === 'firstNight') {
      playSound('night');
    }
  }, [gamePhase, playSound, setTimer]);

  if (!mounted) return null;

  return (
    <GameActionsProvider controller={controller}>
      <ScaleLayout>
        <PortraitLock />
        <motion.div
          className="w-full h-full text-white overflow-hidden"
          initial={{ backgroundColor: '#030712' }}
          animate={{
            backgroundColor: gamePhase === 'day' ? 'rgb(12, 74, 110)' : gamePhase === 'dusk' ? 'rgb(28, 25, 23)' : 'rgb(3, 7, 18)'
          }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          onClick={() => { setContextMenu(null); setShowMenu(false); }}
        >
          {/* ===== 通用加载动画不属于暗流涌动等具体剧本===== */}
          {showIntroLoading && (
            <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
              <div className="font-sans text-7xl font-black tracking-[0.1em] text-red-400 animate-breath-shadow">
                拜甘教
              </div>
              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                <div className="text-lg font-semibold text-red-200/90 font-sans tracking-widest">
                  祈祷中…
                </div>
              </div>
            </div>
          )}

          {baronSetupCheck && (
            <div className="absolute inset-0 z-[9900] bg-black/70 flex items-center justify-center px-4">
              <div className="bg-gray-900 border-4 border-yellow-500 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
                <div className="text-xl font-bold text-yellow-300"> Setup 校验</div>
                <p className="text-sm leading-6 text-gray-100">
                  检测到你选择了男(Baron)但当前镇外来者 ? 数量不符规则
                </p>
                <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700">
                  <div>当前{baronSetupCheck.current.townsfolk} 个镇民{baronSetupCheck.current.outsider} 个外来者</div>
                  <div className="font-semibold text-yellow-200">
                    建议调整为{baronSetupCheck.recommended.townsfolk} 个镇民{baronSetupCheck.recommended.outsider} 个外来者
                  </div>
                  <div className="text-xs text-gray-400">
                    共 {baronSetupCheck.recommended.total} 人局含男爵自动2 名镇民替换为 2 名外来者
                  </div>
                </div>
                <p className="text-sm text-gray-300">
                  你可以点击"自动重排"由系统重新分配，点击"我手动调整"后再继续，或在说书人裁量下点击"保持当前配置"直接开始游戏
                </p>
                <div className="flex flex-row gap-3">
                  <button
                    onClick={handleBaronAutoRebalance}
                    className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition"
                  >
                    自动重排
                  </button>
                  <button
                    onClick={() => setBaronSetupCheck(null)}
                    className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
                  >
                    我手动调 : </button>
                  <button
                    onClick={() => {
                      setIgnoreBaronSetup(true);
                      setBaronSetupCheck(null);
                    }}
                    className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-100 font-bold hover:bg-gray-700 transition"
                  >
                    保持当前配置
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ===== 剧本选择页：占满整个舞台区域，禁止二次缩放 ===== */}
          {gamePhase === 'scriptSelection' && (
            <div className="w-full h-full flex flex-col bg-slate-950 text-white">
              <ScriptSelection
                onScriptSelect={setSelectedScript}
                saveHistory={saveHistory}
                setGameLogs={setGameLogs}
                setGamePhase={setGamePhase}
              />
            </div>
          )}
          {gamePhase === 'setup' && (
            <GameLayout
              leftPanel={
                <div className="w-full h-full p-4">
                  <RoundTable
                    seats={seats}
                    nightInfo={null}
                    selectedActionTargets={[]}
                    isPortrait={false}
                    longPressingSeats={new Set()}
                    onSeatClick={(seat) => {
                      console.log('[app/page setup] RoundTable seat clicked:', seat.id);
                      handleSeatClick(seat.id);
                    }}
                    onContextMenu={(e, seatId) => {
                      e.preventDefault();
                      console.log("右键点击座位:", seatId);
                      setContextMenu({ x: e.clientX, y: e.clientY, seatId });
                    }}
                    onTouchStart={(e, _id) => {
                      // Don't preventDefault - let click events work normally
                      e.stopPropagation();
                    }}
                    onTouchEnd={(e, _id) => {
                      // Don't preventDefault - let click events work normally
                      e.stopPropagation();
                    }}
                    onTouchMove={(e, _id) => {
                      // Don't preventDefault - let click events work normally
                      e.stopPropagation();
                    }}
                    setSeatRef={() => { }}
                    getDisplayRoleType={(seat) => seat.role?.type || null}
                    getDisplayRole={getDisplayRoleForSeat}
                    typeColors={typeColors}
                  />
                </div>
              }
              rightPanel={
                <div className="h-full flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/10 shrink-0 h-16 flex items-center">
                    <h2 className="text-lg font-bold text-purple-300">说书人控制台</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 text-sm min-h-0">
                    <GameSetup
                      seats={seats}
                      selectedScript={selectedScript}
                      selectedRole={selectedRole}
                      setSelectedRole={setSelectedRole}
                      handleSeatClick={handleSeatClick}
                      handlePreStartNight={handlePreStartNight}
                      proceedToCheckPhase={proceedToCheckPhase}
                      filteredGroupedRoles={filteredGroupedRoles}
                      getCompositionStatus={getCompositionStatus}
                      getBaronStatus={getBaronStatus}
                      validateCompositionSetup={validateCompositionSetup}
                      validateBaronSetup={validateBaronSetup}
                      setCompositionError={setCompositionError}
                      setBaronSetupCheck={setBaronSetupCheck}
                      compositionError={compositionError}
                      baronSetupCheck={baronSetupCheck}
                      ignoreBaronSetup={ignoreBaronSetup}
                      setIgnoreBaronSetup={setIgnoreBaronSetup}
                      handleBaronAutoRebalance={handleBaronAutoRebalance}
                      hideSeatingChart={false}
                    />
                  </div>
                </div>
              }
            />
          )}
          {gamePhase !== 'scriptSelection' && gamePhase !== 'setup' && (
            <>
              <GameStage />
              <GameModals />
            </>
          )}

          {/* Setup 相关的 Modals 仍然留在本组件中 */}

          {/* 右键上下文菜单 (Setup 阶段专用) */}
          {contextMenu && gamePhase === 'setup' && (
            <div
              className="fixed z-[9999] bg-slate-800 border border-slate-600 rounded shadow-xl py-1 min-w-[140px] flex flex-col"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()} // 防止点击菜单本身触发关闭
            >
              <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-700 mb-1">
                {contextMenu.seatId + 1}号操作
              </div>
              <button
                className="w-full text-left px-4 py-2 hover:bg-slate-700 text-red-400 font-bold text-sm flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  if (controller.setRedNemesisTarget) {
                    controller.setRedNemesisTarget(contextMenu.seatId);
                  } else {
                    console.error("setRedNemesisTarget not found on controller");
                  }
                  setContextMenu(null); // 关闭菜单
                }}
              >
                <span>🎯</span> 选为红罗刹
              </button>
              {/* 这里可以扩展更多选项，如“设为酒鬼”等 */}
            </div>
          )}
        </motion.div>
      </ScaleLayout>
    </GameActionsProvider>
  );
}
