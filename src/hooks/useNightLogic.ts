"use client";

import { useCallback } from "react";
import type { Seat, Role, GamePhase, LogEntry, Script } from "../../app/data";
import { getRandom, computeIsPoisoned, addPoisonMark, hasTeaLadyProtection } from "../utils/gameRules";
import type { NightInfoResult } from "../types/game";

// 定义 Hook 的输入接口
export interface NightLogicGameState {
  seats: Seat[];
  gamePhase: GamePhase;
  nightCount: number;
  executedPlayerId: number | null;
  wakeQueueIds: number[];
  currentWakeIndex: number;
  selectedActionTargets: number[];
  gameLogs: LogEntry[];
  selectedScript: Script | null;
  deadThisNight: number[];
  currentDuskExecution: number | null;
  pukkaPoisonQueue: Array<{ targetId: number; nightsUntilDeath: number }>;
  todayDemonVoted: boolean;
  todayMinionNominated: boolean;
  todayExecutedId: number | null;
  witchCursedId: number | null;
  witchActive: boolean;
  cerenovusTarget: { targetId: number; roleName: string } | null;
  voteRecords: Array<{ voterId: number; isDemon: boolean }>;
  nominationMap: Record<number, number>;
  poChargeState: Record<number, boolean>;
  goonDrunkedThisNight: boolean;
  isVortoxWorld: boolean;
  nightInfo: NightInfoResult | null;
}

// 定义 Hook 的 Actions 接口
export interface NightLogicActions {
  // State setters
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  setNightCount: React.Dispatch<React.SetStateAction<number>>;
  setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>>;
  setCurrentWakeIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
  setInspectionResult: React.Dispatch<React.SetStateAction<string | null>>;
  setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
  setLastDuskExecution: React.Dispatch<React.SetStateAction<number | null>>;
  setCurrentDuskExecution: React.Dispatch<React.SetStateAction<number | null>>;
  setPukkaPoisonQueue: React.Dispatch<React.SetStateAction<Array<{ targetId: number; nightsUntilDeath: number }>>>;
  setTodayDemonVoted: React.Dispatch<React.SetStateAction<boolean>>;
  setTodayMinionNominated: React.Dispatch<React.SetStateAction<boolean>>;
  setTodayExecutedId: React.Dispatch<React.SetStateAction<number | null>>;
  setWitchCursedId: React.Dispatch<React.SetStateAction<number | null>>;
  setWitchActive: React.Dispatch<React.SetStateAction<boolean>>;
  setCerenovusTarget: React.Dispatch<React.SetStateAction<{ targetId: number; roleName: string } | null>>;
  setVoteRecords: React.Dispatch<React.SetStateAction<Array<{ voterId: number; isDemon: boolean }>>>;
  setNominationMap: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setGoonDrunkedThisNight: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVortoxWorld: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNightOrderModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingNightQueue: React.Dispatch<React.SetStateAction<Seat[] | null>>;
  setNightOrderPreview: React.Dispatch<React.SetStateAction<Array<{ roleName: string; seatNo: number; order: number }>>>;
  setNightQueuePreviewTitle: React.Dispatch<React.SetStateAction<string>>;
  setShowNightDeathReportModal: React.Dispatch<React.SetStateAction<string | null>>;
  setShowKillConfirmModal: React.Dispatch<React.SetStateAction<number | null>>;
  setShowMayorRedirectModal: React.Dispatch<React.SetStateAction<{ targetId: number; demonName: string } | null>>;
  setShowAttackBlockedModal: React.Dispatch<React.SetStateAction<{
    targetId: number;
    reason: string;
    demonName?: string;
  } | null>>;
  setStartTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setMayorRedirectTarget: React.Dispatch<React.SetStateAction<number | null>>;

  // Helper functions
  addLog: (message: string) => void;
  addLogWithDeduplication: (msg: string, playerId?: number, roleName?: string) => void;
  killPlayer: (
    targetId: number,
    options?: {
      recordNightDeath?: boolean;
      keepInWakeQueue?: boolean;
      seatTransformer?: (seat: Seat) => Seat;
      skipGameOverCheck?: boolean;
      executedPlayerId?: number | null;
      onAfterKill?: (latestSeats: Seat[]) => void;
    }
  ) => void;
  saveHistory: () => void;
  resetRegistrationCache: (key: string) => void;
  getSeatRoleId: (seat?: Seat | null) => string | null;
  getDemonDisplayName: (roleId?: string, fallbackName?: string) => string;
  enqueueRavenkeeperIfNeeded: (targetId: number) => void;
  continueToNextAction: () => void;
  seatsRef: React.MutableRefObject<Seat[]>;
}

// 生成夜晚唤醒队列的辅助函数
function getNightWakeQueue(seats: Seat[], isFirst: boolean): Seat[] {
  const activeSeats = seats.filter(s => {
    if (!s.role) return false;
    if (s.isDead && !s.hasAbilityEvenDead) return false; // 已死亡且不保留能力的玩家不唤醒
    
    const effectiveRole = s.role.id === 'drunk' ? s.charadeRole : s.role;
    if (!effectiveRole) return false;
    
    // 根据是否为首夜来决定唤醒哪些角色
    // NEW (data-driven): prefer Meta protocol
    const metaWakeable = isFirst ? !!effectiveRole.firstNightMeta : !!effectiveRole.otherNightMeta;
    if (metaWakeable) return true;

    // Legacy fallback: old boolean flags
    if (isFirst) return effectiveRole.firstNight === true;
    return effectiveRole.otherNight === true;
  });

  // Debug logging
  if (isFirst) {
    console.log('[getNightWakeQueue] First night - Active seats with roles:', seats.filter(s => s.role).map(s => ({
      id: s.id,
      roleId: s.role?.id,
      roleName: s.role?.name,
      firstNight: s.role?.id === 'drunk' ? s.charadeRole?.firstNight : s.role?.firstNight
    })));
    console.log('[getNightWakeQueue] First night - Wake queue length:', activeSeats.length);
  }

  return activeSeats;
}

/**
 * 夜晚逻辑管理 Hook
 * 包含夜晚相关的业务逻辑函数
 */
export function useNightLogic(gameState: NightLogicGameState, actions: NightLogicActions) {
  const {
    seats,
    gamePhase,
    nightCount,
    deadThisNight,
    currentDuskExecution,
    pukkaPoisonQueue,
    nightInfo,
  } = gameState;

  const {
    setSeats,
    setGamePhase,
    setNightCount,
    setWakeQueueIds,
    setCurrentWakeIndex,
    setSelectedActionTargets,
    setInspectionResult,
    setDeadThisNight,
    setLastDuskExecution,
    setCurrentDuskExecution,
    setPukkaPoisonQueue,
    setTodayDemonVoted,
    setTodayMinionNominated,
    setTodayExecutedId,
    setWitchCursedId,
    setWitchActive,
    setCerenovusTarget,
    setVoteRecords,
    setNominationMap,
    setGoonDrunkedThisNight,
    setIsVortoxWorld,
    setShowNightOrderModal,
    setPendingNightQueue,
    setNightOrderPreview,
    setNightQueuePreviewTitle,
    setShowNightDeathReportModal,
    setShowKillConfirmModal,
    setShowMayorRedirectModal,
    setShowAttackBlockedModal,
    setStartTime,
    setMayorRedirectTarget,
    addLog,
    addLogWithDeduplication,
    killPlayer,
    saveHistory,
    resetRegistrationCache,
    getSeatRoleId,
    getDemonDisplayName,
    enqueueRavenkeeperIfNeeded,
    continueToNextAction,
    seatsRef,
  } = actions;

  /**
   * 完成夜晚初始化
   * 设置唤醒队列、游戏阶段等状态
   * IMPORTANT: This function sets wakeQueueIds SYNCHRONOUSLY before changing phase
   */
  const finalizeNightStart = useCallback((queue: Seat[], isFirst: boolean) => {
    console.log('[finalizeNightStart] ========== FUNCTION CALLED ==========');
    console.log('[finalizeNightStart] queue:', queue);
    console.log('[finalizeNightStart] queue length:', queue?.length);
    console.log('[finalizeNightStart] isFirst:', isFirst);
    
    if (!queue || queue.length === 0) {
      console.error('[finalizeNightStart] Queue is empty!');
      return;
    }
    
    const queueIds = queue.map(s => s.id);
    console.log('[finalizeNightStart] Setting wakeQueueIds:', queueIds, 'isFirst:', isFirst);
    console.log('[finalizeNightStart] Queue IDs:', queueIds);
    
    // CRITICAL: Set wakeQueueIds FIRST, before phase change
    console.log('[finalizeNightStart] Calling setWakeQueueIds...');
    setWakeQueueIds(queueIds);
    console.log('[finalizeNightStart] Calling setCurrentWakeIndex(0)...');
    setCurrentWakeIndex(0);
    console.log('[finalizeNightStart] Calling setSelectedActionTargets([])...');
    setSelectedActionTargets([]);
    console.log('[finalizeNightStart] Calling setInspectionResult(null)...');
    setInspectionResult(null);
    
    // Then change phase
    const targetPhase = isFirst ? "firstNight" : "night";
    console.log('[finalizeNightStart] Calling setGamePhase to:', targetPhase);
    setGamePhase(targetPhase);
    if (!isFirst) {
      console.log('[finalizeNightStart] Incrementing nightCount...');
      setNightCount(n => n + 1);
    }
    console.log('[finalizeNightStart] Calling setShowNightOrderModal(false)...');
    setShowNightOrderModal(false);
    console.log('[finalizeNightStart] Calling setPendingNightQueue(null)...');
    setPendingNightQueue(null);
    
    console.log('[finalizeNightStart] ✅ Phase changed to:', targetPhase, 'with', queueIds.length, 'wakeable roles');
    console.log('[finalizeNightStart] ========== FUNCTION COMPLETED ==========');
  }, [
    setWakeQueueIds,
    setCurrentWakeIndex,
    setSelectedActionTargets,
    setInspectionResult,
    setGamePhase,
    setNightCount,
    setShowNightOrderModal,
    setPendingNightQueue,
  ]);

  /**
   * 开始夜晚
   * 进行身份检查、排序、处理特殊效果等
   */
  const startNight = useCallback((isFirst: boolean) => {
    console.log('[startNight] invoked with isFirst =', isFirst);
    try {
      // 保存历史记录
      saveHistory();
      console.log('[startNight] saveHistory completed');
      
      // 白天事件与标记重置
      setTodayDemonVoted(false);
      setTodayMinionNominated(false);
      setTodayExecutedId(null);
      setWitchCursedId(null);
      setWitchActive(false);
      setCerenovusTarget(null);
      setVoteRecords([]); // 重置投票记录
      resetRegistrationCache(`${isFirst ? 'firstNight' : 'night'}-${isFirst ? 1 : nightCount + 1}`);
      setNominationMap({});
      const nightlyDeaths: number[] = [];
      setGoonDrunkedThisNight(false);
      setNightQueuePreviewTitle(isFirst ? `首夜叫醒顺位` : "");
      
      // 对于非首夜，在进入夜晚前将当前黄昏的处决记录保存为"上一个黄昏的处决记录"
      // 这样送葬者在夜晚时就能看到上一个黄昏的处决信息
      if (!isFirst) {
        if (currentDuskExecution !== null) {
          setLastDuskExecution(currentDuskExecution);
          // 清空当前黄昏的处决记录，准备记录新的处决
          setCurrentDuskExecution(null);
        }
        // 如果当前黄昏没有处决，保持上一个黄昏的记录（如果有的话）
        // 如果上一个黄昏也没有处决，lastDuskExecution保持为null
      }
      
      if (isFirst) setStartTime(new Date());
      
      // 普卡特殊处理：按队列推进中毒->死亡流程
      const pukkaDeaths: number[] = [];
      const nextPukkaQueue = pukkaPoisonQueue
        .map(entry => {
          const targetSeat = seats.find(s => s.id === entry.targetId);
          // 如果目标已经死亡、被处决或其他效果移出队列
          if (targetSeat?.isDead) return null;
          const nightsLeft = entry.nightsUntilDeath - 1;
          if (nightsLeft <= 0) {
            pukkaDeaths.push(entry.targetId);
            return null;
          }
          return { ...entry, nightsUntilDeath: nightsLeft };
        })
        .filter((v): v is { targetId: number; nightsUntilDeath: number } => !!v);
      
      if (pukkaDeaths.length > 0) {
        pukkaDeaths.forEach((id, idx) => {
          nightlyDeaths.push(id);
          const isLast = idx === pukkaDeaths.length - 1;
          killPlayer(id, {
            seatTransformer: seat => {
              const filteredStatuses = (seat.statusDetails || []).filter(st => st !== '普卡中毒');
              const nextSeat = { ...seat, statusDetails: filteredStatuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            },
            skipGameOverCheck: !isLast, // 最后一次再检查游戏结束，避免重复检查
          });
          addLog(`${id + 1}号因普卡的中毒效果死亡并恢复健康`);
        });
      }
      // 更新普卡队列，存活者继续保持中毒状态
      setPukkaPoisonQueue(nextPukkaQueue);
      
      // 清除状态标记
      setSeats(p => p.map(s => {
        // 清除所有带清除时间的标记，根据清除时间判断
        const filteredStatusDetails = (s.statusDetails || []).filter(st => {
          // 保留永久标记
          if (st.includes('永久中毒') || st.includes('永久')) return true;
          // 清除所有带"次日黄昏清除"、"下个黄昏清除"、"至下个黄昏清除"
          if (st.includes('次日黄昏清除') || st.includes('下个黄昏清除') || st.includes('至下个黄昏清除')) return false;
          // 清除所有带"Night+Day"、"1 Day"等标准清除时间的状态
          const status = s.statuses?.find(st => st.effect && st.duration === '1 Day' || st.duration === 'Night+Day');
          if (status && (status.duration === '1 Day' || status.duration === 'Night+Day')) return false;
          // 保留其他状态
          return true;
        });
        
        // 清除水手/旅店老板造成的醉酒状态，这些状态持续到"下个黄昏"，进入夜晚时清除
        const filteredStatusDetailsForDrunk = filteredStatusDetails.filter(st => {
          // 清除水手/旅店老板造成的醉酒标记，这些标记包含"至下个黄昏清除"
          if (st.includes('水手致醉') && st.includes('至下个黄昏清除')) return false;
          if (st.includes('旅店老板致醉') && st.includes('至下个黄昏清除')) return false;
          return true;
        });
        
        const filteredStatuses = (s.statuses || []).filter(status => {
          if (status.effect === 'Drunk' && (status.duration === '下个黄昏' || status.duration === '至下个黄昏清除')) {
            return false;
          }
          if (status.effect === 'ExecutionProof' && status.duration === '1 Day') {
            return false;
          }
          return true;
        });
        
        return {
          ...s,
          statusDetails: filteredStatusDetailsForDrunk,
          statuses: filteredStatuses,
          isPoisoned: computeIsPoisoned({ ...s, statusDetails: filteredStatusDetailsForDrunk, statuses: filteredStatuses }),
          isDrunk: filteredStatusDetailsForDrunk.some(st => st.includes('致醉')) ? s.isDrunk : false,
        };
      }));
      
      // 生成夜晚唤醒队列
      const validQueue = getNightWakeQueue(seats, isFirst);
      
      // Debug logging
      console.log('[startNight] isFirst:', isFirst, 'validQueue length:', validQueue.length);
      if (isFirst && validQueue.length === 0) {
        console.warn('[startNight] First night queue is empty! Active seats:', seats.filter(s => s.role).map(s => ({
          id: s.id,
          roleId: s.role?.id,
          roleName: s.role?.name,
          firstNight: s.role?.id === 'drunk' ? s.charadeRole?.firstNight : s.role?.firstNight
        })));
      }
      
      if (validQueue.length === 0) {
        // For first night, if no roles wake, we should still proceed but with an empty queue
        // This allows the game to continue to dawn
        if (isFirst) {
          console.warn('[startNight] First night has no wakeable roles. Proceeding with empty queue.');
          // Set empty queue but still allow progression
          setWakeQueueIds([]);
          setCurrentWakeIndex(0);
          setSelectedActionTargets([]);
          setInspectionResult(null);
          // For first night with no wakeable roles, go directly to dawn
          if (nightlyDeaths.length > 0) {
            const deadNames = nightlyDeaths.map(id => `${id + 1}号`).join('、');
            setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
          } else {
            setShowNightDeathReportModal("昨天是个平安夜");
          }
          setGamePhase('dawnReport');
          return;
        } else {
          // For other nights, same behavior
          setWakeQueueIds([]);
          setCurrentWakeIndex(0);
          if (nightlyDeaths.length > 0) {
            const deadNames = nightlyDeaths.map(id => `${id + 1}号`).join('、');
            setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
          } else {
            setShowNightDeathReportModal("昨天是个平安夜");
          }
          setGamePhase('dawnReport');
          return;
        }
      }
      
      if (isFirst) {
        console.log('[startNight] First night - Setting up preview modal');
        console.log('[startNight] validQueue length:', validQueue.length);
        console.log('[startNight] validQueue:', validQueue.map(s => ({ id: s.id, roleId: s.role?.id, roleName: s.role?.name })));
        
        setPendingNightQueue(validQueue);
        const preview = validQueue
          .map(s => {
            const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
            return { 
              roleName: r?.name || '未知角色', 
              seatNo: s.id + 1, 
              order: r?.firstNightOrder ?? 999 
            };
          })
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        
        console.log('[startNight] Preview data:', preview);
        setNightOrderPreview(preview);
        
        console.log('[startNight] Calling setShowNightOrderModal(true)...');
        setShowNightOrderModal(true);
        console.log('[startNight] ✅ Modal should be visible now');
        return;
      }
      
      finalizeNightStart(validQueue, isFirst);
    } catch (error) {
      console.error('[startNight] Unhandled error:', error);
      alert(`入夜时发生错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [
    seats,
    nightCount,
    currentDuskExecution,
    pukkaPoisonQueue,
    saveHistory,
    resetRegistrationCache,
    setSeats,
    setGamePhase,
    setNightCount,
    setWakeQueueIds,
    setCurrentWakeIndex,
    setTodayDemonVoted,
    setTodayMinionNominated,
    setTodayExecutedId,
    setWitchCursedId,
    setWitchActive,
    setCerenovusTarget,
    setVoteRecords,
    setNominationMap,
    setGoonDrunkedThisNight,
    setPukkaPoisonQueue,
    setLastDuskExecution,
    setCurrentDuskExecution,
    setStartTime,
    setNightQueuePreviewTitle,
    setShowNightOrderModal,
    setPendingNightQueue,
    setNightOrderPreview,
    setShowNightDeathReportModal,
    killPlayer,
    addLog,
    finalizeNightStart,
  ]);

  /**
   * 处理恶魔击杀逻辑
   * 检查保护、特殊角色效果等
   */
  const processDemonKill = useCallback((
    targetId: number,
    options: { skipMayorRedirectCheck?: boolean; mayorId?: number | null } = {}
  ): 'pending' | 'resolved' => {
    if (!nightInfo) return 'resolved';
    const killerRoleId = nightInfo.effectiveRole.id;
    const seatsSnapshot = seatsRef.current || seats;
    const target = seatsSnapshot.find(s => s.id === targetId);
    if (!target) return 'resolved';

    // 检查保护是否有效，如果被保护，必须检查保护者（僧侣）是否中醉酒
    let isEffectivelyProtected = false;
    if (target.isProtected && target.protectedBy !== null) {
      const protector = seatsSnapshot.find(s => s.id === target.protectedBy);
      if (protector) {
        // 如果保护者中醉酒，保护绝对无效，无论isProtected是否为true
        const isProtectorPoisoned = protector.isPoisoned || protector.isDrunk || protector.role?.id === "drunk";
        if (isProtectorPoisoned) {
          // 保护者中醉酒，保护无效，同时清除错误的保护状态
          isEffectivelyProtected = false;
          setSeats(p => p.map(s => 
            s.id === targetId ? {...s, isProtected: false, protectedBy: null} : s
          ));
        } else {
          // 保护者健康，保护有效
          isEffectivelyProtected = true;
        }
      } else {
        // 保护者不存在，保护无效
        isEffectivelyProtected = false;
      }
    }
    const teaLadyProtected = hasTeaLadyProtection(target, seatsSnapshot);
    
    // 检查目标是否可以被杀死（僵怖假死状态可以被杀死）
    const canBeKilled = target && !isEffectivelyProtected && !teaLadyProtected && target.role?.id !== 'soldier' && 
      (!target.isDead || (target.role?.id === 'zombuul' && target.isFirstDeathForZombuul && !target.isZombuulTrulyDead));

    // 如果因为保护或士兵能力导致无法杀死且目标存活，添加统一日志说明
    if (target && !target.isDead && !canBeKilled) {
      const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
      let protectionReason = '';
      
      if (target.role?.id === 'soldier') {
        protectionReason = '士兵能力';
      } else if (isEffectivelyProtected) {
        protectionReason = '僧侣保护';
      } else if (teaLadyProtected) {
        protectionReason = '茶艺师保护';
      }
      
      if (protectionReason) {
        addLogWithDeduplication(
          `恶魔(${demonName}) 攻击 ${targetId + 1}号，但因为${protectionReason}，${targetId + 1}号没有死亡`,
          nightInfo.seat.id,
          demonName
        );
        setShowAttackBlockedModal({
          targetId,
          reason: protectionReason,
          demonName,
        });
      }
    }

    // 市长特殊处理：允许死亡转移
    if (canBeKilled && !options.skipMayorRedirectCheck && target.role?.id === 'mayor') {
      const aliveCandidates = seats.filter(s => !s.isDead && s.id !== targetId);
      if (aliveCandidates.length > 0) {
        setMayorRedirectTarget(null);
        setShowKillConfirmModal(null);
        setShowMayorRedirectModal({
          targetId,
          demonName: getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name)
        });
        return 'pending';
      }
    }
    
    const mayorNote = options.mayorId !== undefined && options.mayorId !== null 
      ? `（由${options.mayorId + 1}号市长转移）`
      : '';

    if (canBeKilled) {
      // 夜半狂欢亡骨魔特殊处理：杀死爪牙时，爪牙保留能力且邻近的两名镇民之一中毒
      if (nightInfo.effectiveRole.id === 'vigormortis_mr' && target.role?.type === 'minion') {
        // 找到邻近的两名镇民
        const targetIndex = seats.findIndex(s => s.id === targetId);
        const totalSeats = seats.length;
        const leftIndex = (targetIndex - 1 + totalSeats) % totalSeats;
        const rightIndex = (targetIndex + 1) % totalSeats;
        const leftNeighbor = seats[leftIndex];
        const rightNeighbor = seats[rightIndex];
        const townsfolkNeighbors = [leftNeighbor, rightNeighbor].filter(s => 
          s.role?.type === 'townsfolk' && !s.isDead
        );
        
        // 随机选择一名镇民中毒
        const poisonedNeighbor = townsfolkNeighbors.length > 0 ? getRandom(townsfolkNeighbors) : null;
        
        if (poisonedNeighbor) {
          setSeats(p => p.map(s => {
            if (s.id === poisonedNeighbor.id) {
              // 亡骨魔中毒是永久的
              const clearTime = '永久';
              const { statusDetails, statuses } = addPoisonMark(s, 'vigormortis', clearTime);
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
          }));
        }

        killPlayer(targetId, {
          keepInWakeQueue: true, // 保留能力，需要夜晚继续唤醒
          seatTransformer: seat => ({ ...seat, hasAbilityEvenDead: true }),
          onAfterKill: () => {
            if (nightInfo) {
              addLogWithDeduplication(
                `${nightInfo.seat.id + 1}号(亡骨魔) 杀死 ${targetId + 1}号(爪牙)${mayorNote}，爪牙保留能力${poisonedNeighbor ? `，${poisonedNeighbor.id + 1}号(邻近镇民)中毒` : ''}`,
                nightInfo.seat.id,
                '亡骨魔'
              );
            }
          }
        });
      } else {
        // 正常杀死其他玩家
        killPlayer(targetId, {
          onAfterKill: () => {
            if (nightInfo) {
              // 涡流标记假信息环境
              if (killerRoleId === 'vortox') {
                setIsVortoxWorld(true);
              }
              const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
              addLogWithDeduplication(
                `${nightInfo.seat.id + 1}号(${demonName}) 杀死 ${targetId + 1}号${mayorNote ? mayorNote : ''}，${targetId + 1}号已在夜晚死亡`,
                nightInfo.seat.id,
                demonName
              );
            }
          }
        });
      }
    }
    return 'resolved';
  }, [
    nightInfo,
    seats,
    seatsRef,
    setSeats,
    setIsVortoxWorld,
    setShowKillConfirmModal,
    setShowMayorRedirectModal,
    setShowAttackBlockedModal,
    setMayorRedirectTarget,
    killPlayer,
    addLogWithDeduplication,
    getDemonDisplayName,
  ]);

  return {
    startNight,
    finalizeNightStart,
    processDemonKill,
  };
}

