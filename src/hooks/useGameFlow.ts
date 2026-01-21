"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { GamePhase, Seat, Role } from "../../app/data";
import type { ModalType } from "../types/modal";

export interface GameFlowState {
  gamePhase: GamePhase;
  setGamePhase: Dispatch<SetStateAction<GamePhase>>;
  nightCount: number;
  setNightCount: Dispatch<SetStateAction<number>>;
  timer: number;
  setTimer: Dispatch<SetStateAction<number>>;
}

export interface UseGameFlowResult {
  gamePhase: GamePhase;
  setGamePhase: Dispatch<SetStateAction<GamePhase>>;
  nightCount: number;
  setNightCount: Dispatch<SetStateAction<number>>;
  timer: number;
  setTimer: Dispatch<SetStateAction<number>>;
  isTimerRunning: boolean;
  handleTimerPause: () => void;
  handleTimerStart: () => void;
  handleTimerReset: () => void;
  // 流程控制入口：目前仅管理 phase 与计数，具体夜晚逻辑仍由 useNightLogic 负责
  startNight: (isFirstNight: boolean) => void;
  enterNightPhase: (target: GamePhase, isFirstNight: boolean) => void;
  enterDayPhase: () => void;
  enterDuskPhase: () => void;
  handleDayEndTransition: () => void;
  handleSwitchScript: () => void;
  handleNewGame: () => void;
  closeNightOrderPreview: () => void;
  confirmNightOrderPreview: () => void;
  proceedToCheckPhase: (seatsToUse: Seat[]) => void;
  handlePreStartNight: () => void;
  handleStartNight: (isFirst: boolean) => void;
  proceedToFirstNight: () => void;
  tickTimer: (delta: number) => void;
}

export interface GameFlowDeps {
  /**
   * 由上层提供的夜晚启动实现（来自 useNightLogic）
   * 这样 useGameFlow 作为统一入口，便于后续替换/扩展。
   */
  startNightImpl?: (isFirstNight: boolean) => void;
  mounted?: boolean;

  // === For dusk/day transitions (migrated from controller) ===
  seats?: Seat[];
  saveHistory?: () => void;
  currentDuskExecution?: number | null;
  setLastDuskExecution?: Dispatch<SetStateAction<number | null>>;
  setCurrentDuskExecution?: Dispatch<SetStateAction<number | null>>;
  setOutsiderDiedToday?: Dispatch<SetStateAction<boolean>>;
  setSeats?: Dispatch<SetStateAction<Seat[]>>;
  setNominationRecords?: Dispatch<SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>>;
  setNominationMap?: Dispatch<SetStateAction<Record<number, number>>>;
  setCurrentModal?: Dispatch<SetStateAction<ModalType | null>>;
  addLog?: (msg: string) => void;
  isActorDisabledByPoisonOrDrunk?: (seat: Seat | undefined, knownIsPoisoned?: boolean) => boolean;
  computeIsPoisoned?: (seat: Seat) => boolean;

  // === For switching script / starting new game ===
  selectedScript?: { name: string } | null;
  nightCount?: number;
  startTime?: Date | null;
  timer?: number;
  gameLogs?: any[];
  seatsSnapshotForRecord?: any[];
  saveGameRecord?: (record: any) => void;
  triggerIntroLoading?: () => void;
  setSelectedScript?: Dispatch<SetStateAction<any>>;
  setNightCount?: Dispatch<SetStateAction<number>>;
  setExecutedPlayerId?: Dispatch<SetStateAction<number | null>>;
  setWakeQueueIds?: Dispatch<SetStateAction<number[]>>;
  setCurrentWakeIndex?: Dispatch<SetStateAction<number>>;
  setSelectedActionTargets?: Dispatch<SetStateAction<number[]>>;
  setWinResult?: Dispatch<SetStateAction<any>>;
  setDeadThisNight?: Dispatch<SetStateAction<number[]>>;
  setPukkaPoisonQueue?: Dispatch<SetStateAction<any[]>>;
  setSelectedRole?: Dispatch<SetStateAction<any>>;
  setInspectionResult?: Dispatch<SetStateAction<string | null>>;
  setCurrentHint?: Dispatch<SetStateAction<any>>;
  setTimer?: Dispatch<SetStateAction<number>>;
  setStartTime?: Dispatch<SetStateAction<Date | null>>;
  setHistory?: Dispatch<SetStateAction<any[]>>;
  setWinReason?: Dispatch<SetStateAction<string | null>>;
  clearHintCaches?: () => void;
  resetRegistrationCache?: (key: string) => void;
  setAutoRedHerringInfo?: Dispatch<SetStateAction<string | null>>;
  setNightOrderPreview?: Dispatch<SetStateAction<any[]>>;
  setPendingNightQueue?: Dispatch<SetStateAction<any>>;
  pendingNightQueue?: any;
  setInitialSeats?: Dispatch<SetStateAction<any[]>>;
  setGameLogs?: Dispatch<SetStateAction<any[]>>;
  setBaronSetupCheck?: Dispatch<SetStateAction<any>>;
  setIgnoreBaronSetup?: Dispatch<SetStateAction<boolean>>;
  setShowMinionKnowDemonModal?: Dispatch<SetStateAction<any>>;

  // === For starting night / first night ===
  roles?: Role[];
  isGoodAlignment?: (seat: Seat) => boolean;
  generateNightTimeline?: (seats: Seat[], isFirstNight: boolean) => any[];
  finalizeNightStart?: (queue: any[], isFirstNight: boolean) => void;
  getRandom?: <T = any>(arr: T[]) => T;
}

/**
 * useGameFlow - 流程控制（轻量版）
 * 只负责统一修改 gamePhase/nightCount/timer，不掺杂夜晚/白天的业务细节。
 */
export function useGameFlow(base: GameFlowState, deps: GameFlowDeps = {}): UseGameFlowResult {
  // Timer running state (migrated from controller)
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  useEffect(() => {
    base.setTimer(0);
    setIsTimerRunning(true);
  }, [base.gamePhase, base.setTimer]);

  useEffect(() => {
    if (!deps.mounted || !isTimerRunning) return;
    const i = setInterval(() => base.setTimer(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [deps.mounted, isTimerRunning, base.setTimer]);

  const handleTimerPause = useCallback(() => {
    setIsTimerRunning(false);
  }, []);

  const handleTimerStart = useCallback(() => {
    setIsTimerRunning(true);
  }, []);

  const handleTimerReset = useCallback(() => {
    base.setTimer(0);
    setIsTimerRunning(true);
  }, [base.setTimer]);

  const startNight = useCallback(
    (isFirstNight: boolean) => {
      if (deps.startNightImpl) {
        deps.startNightImpl(isFirstNight);
      } else {
        // fallback：仅切相位并递增夜数，保持旧行为
        base.setGamePhase(isFirstNight ? 'firstNight' : 'night');
        if (!isFirstNight) {
          base.setNightCount(n => n + 1);
        }
      }
    },
    [deps.startNightImpl, base.setGamePhase, base.setNightCount]
  );

  const enterNightPhase = useCallback(
    (target: GamePhase, isFirstNight: boolean) => {
      base.setGamePhase(target);
      if (!isFirstNight) {
        base.setNightCount(n => n + 1);
      }
      // 计时器交给 UI 或上层控制，这里不自动重置
    },
    [base.setGamePhase, base.setNightCount]
  );

  const enterDayPhase = useCallback(
    () => {
      base.setGamePhase('day');
    },
    [base.setGamePhase]
  );

  const enterDuskPhase = useCallback(() => {
    deps.saveHistory?.();

    // 进入新黄昏时保存处决记录供送葬者读取
    if (deps.setLastDuskExecution) {
      deps.setLastDuskExecution(deps.currentDuskExecution ?? null);
    }
    deps.setCurrentDuskExecution?.(null);

    // 每个新黄昏开始时，重置“白天有外来者死亡”标记（教父额外杀人仅本夜生效）
    deps.setOutsiderDiedToday?.(false);

    // 清除应在“次日黄昏/下个黄昏”移除的中毒/醉酒等临时状态
    if (deps.setSeats && deps.computeIsPoisoned) {
      deps.setSeats(prev =>
        prev.map(s => {
          const filteredStatusDetails = (s.statusDetails || []).filter(st => {
            if (st.includes('永久中毒') || st.includes('永久')) return true;
            if (st.includes('普卡中毒')) return true;
            if (
              st.includes('次日黄昏清除') ||
              st.includes('下个黄昏清除') ||
              st.includes('至下个黄昏清除') ||
              st.includes('次日黄昏') ||
              st.includes('下个黄昏')
            ) {
              return false;
            }
            return true;
          });

          const filteredStatuses = (s.statuses || []).filter(status => {
            const isTempPoisonOrDrunk =
              (status.effect === 'Poison' || status.effect === 'Drunk') &&
              (typeof status.duration === 'string') &&
              (
                status.duration.includes('次日黄昏') ||
                status.duration.includes('下个黄昏') ||
                status.duration.includes('黄昏清除') ||
                status.duration === 'Night+Day' ||
                status.duration === '1 Day'
              );
            if (isTempPoisonOrDrunk) return false;
            return true;
          });

          // 侍臣：醉酒 3 天 3 夜（每个新黄昏开始时递减一次）
          const decrementedStatuses = (filteredStatuses as any[])
            .map((status: any) => {
              if (status.effect === 'Drunk' && status.duration === '侍臣3天3夜' && typeof status.remainingDays === 'number') {
                return { ...status, remainingDays: Math.max(0, status.remainingDays - 1) };
              }
              return status;
            })
            .filter((status: any) => {
              if (status.effect === 'Drunk' && status.duration === '侍臣3天3夜' && typeof status.remainingDays === 'number') {
                return status.remainingDays > 0;
              }
              return true;
            });

          const filteredStatusDetailsWithCourtier = filteredStatusDetails.filter(st => {
            if (st.includes('侍臣致醉') && !decrementedStatuses.some((x: any) => x.effect === 'Drunk' && x.duration === '侍臣3天3夜')) {
              return false;
            }
            return true;
          });

          const poisonedAfterClean = deps.computeIsPoisoned!({
            ...s,
            statusDetails: filteredStatusDetailsWithCourtier,
            statuses: decrementedStatuses,
          } as Seat);
          const drunkAfterClean =
            (s.role?.id === 'drunk') ||
            decrementedStatuses.some((st: any) => st.effect === 'Drunk') ||
            filteredStatusDetailsWithCourtier.some((d) => d.includes('致醉') || d.includes('醉酒'));

          return {
            ...s,
            statusDetails: filteredStatusDetailsWithCourtier,
            statuses: decrementedStatuses,
            isPoisoned: poisonedAfterClean,
            isDrunk: drunkAfterClean,
            voteCount: undefined,
            isCandidate: false,
          };
        })
      );
    }

    base.setGamePhase('dusk');
    deps.setNominationRecords?.({ nominators: new Set(), nominees: new Set() });
    deps.setNominationMap?.({});
    deps.setCurrentModal?.(null);
  }, [
    deps.saveHistory,
    deps.currentDuskExecution,
    deps.setLastDuskExecution,
    deps.setCurrentDuskExecution,
    deps.setOutsiderDiedToday,
    deps.setSeats,
    deps.computeIsPoisoned,
    deps.setNominationRecords,
    deps.setNominationMap,
    deps.setCurrentModal,
    base.setGamePhase,
  ]);

  const handleDayEndTransition = useCallback(() => {
    const seats = deps.seats || [];
    const aliveCount = seats.filter(s => !s.isDead).length;
    const mayorSeat = seats.find(s => s.role?.id === 'mayor' && !s.isDead);
    if (aliveCount === 3 && mayorSeat && deps.isActorDisabledByPoisonOrDrunk && !deps.isActorDisabledByPoisonOrDrunk(mayorSeat)) {
      deps.setCurrentModal?.({ type: 'MAYOR_THREE_ALIVE', data: null });
      return;
    }
    enterDuskPhase();
  }, [deps.seats, deps.isActorDisabledByPoisonOrDrunk, deps.setCurrentModal, enterDuskPhase]);

  const handleSwitchScript = useCallback(() => {
    // 如果游戏正在进行不是scriptSelection阶段先结束游戏并保存记录
    if (base.gamePhase !== 'scriptSelection' && deps.selectedScript && deps.saveGameRecord) {
      const updatedLogs = [...(deps.gameLogs || []), { day: deps.nightCount ?? 0, phase: base.gamePhase, message: "说书人结束了游戏" }];
      const endTime = new Date();
      const duration = deps.startTime ? Math.floor((endTime.getTime() - deps.startTime.getTime()) / 1000) : (deps.timer ?? 0);
      const record = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: deps.selectedScript.name,
        startTime: deps.startTime ? deps.startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration,
        winResult: null,
        winReason: "说书人结束了游戏",
        seats: JSON.parse(JSON.stringify(deps.seatsSnapshotForRecord || deps.seats || [])),
        gameLogs: updatedLogs,
      };
      deps.saveGameRecord(record);
    }

    deps.triggerIntroLoading?.();
    base.setGamePhase('scriptSelection');
    deps.setSelectedScript?.(null);
    deps.setNightCount?.(1);
    deps.setExecutedPlayerId?.(null);
    deps.setWakeQueueIds?.([]);
    deps.setCurrentWakeIndex?.(0);
    deps.setSelectedActionTargets?.([]);
    deps.setWinResult?.(null);
    deps.setDeadThisNight?.([]);
    deps.setPukkaPoisonQueue?.([]);
    deps.setSelectedRole?.(null);
    deps.setInspectionResult?.(null);
    deps.setCurrentHint?.({ isPoisoned: false, guide: "", speak: "" });
    base.setTimer(0);
    deps.setStartTime?.(null);
    deps.setHistory?.([]);
    deps.setWinReason?.(null);
    deps.clearHintCaches?.();
    deps.resetRegistrationCache?.('idle');
    deps.setAutoRedHerringInfo?.(null);
    deps.setCurrentModal?.(null);
    deps.setNightOrderPreview?.([]);
    deps.setPendingNightQueue?.(null);
    if (deps.setSeats) {
      deps.setSeats(Array.from({ length: 15 }, (_, i) => ({
        id: i,
        role: null,
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        hasBeenNominated: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        grandchildId: null,
        isGrandchild: false,
        zombuulLives: 1
      })) as any);
    }
    deps.setInitialSeats?.([]);
  }, [base.gamePhase, base.setGamePhase, base.setTimer, deps]);

  const handleNewGame = useCallback(() => {
    deps.triggerIntroLoading?.();
    base.setGamePhase('scriptSelection');
    deps.setSelectedScript?.(null);
    deps.setNightCount?.(1);
    deps.setExecutedPlayerId?.(null);
    deps.setWakeQueueIds?.([]);
    deps.setCurrentWakeIndex?.(0);
    deps.setSelectedActionTargets?.([]);
    deps.setGameLogs?.([]);
    deps.setWinResult?.(null);
    deps.setDeadThisNight?.([]);
    deps.setSelectedRole?.(null);
    deps.setInspectionResult?.(null);
    deps.setCurrentHint?.({ isPoisoned: false, guide: "", speak: "" });
    base.setTimer(0);
    deps.setStartTime?.(null);
    deps.setHistory?.([]);
    deps.setWinReason?.(null);
    deps.clearHintCaches?.();
    deps.resetRegistrationCache?.('idle');
    deps.setAutoRedHerringInfo?.(null);
    deps.setCurrentModal?.(null);
    deps.setNightOrderPreview?.([]);
    deps.setPendingNightQueue?.(null);
    deps.setBaronSetupCheck?.(null);
    deps.setIgnoreBaronSetup?.(false);
    deps.setShowMinionKnowDemonModal?.(null);
    if (deps.setSeats) {
      deps.setSeats(Array.from({ length: 15 }, (_, i) => ({
        id: i,
        role: null,
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        hasBeenNominated: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        grandchildId: null,
        isGrandchild: false,
        zombuulLives: 1
      })) as any);
    }
    deps.setInitialSeats?.([]);
  }, [base.setGamePhase, base.setTimer, deps]);

  const proceedToCheckPhase = useCallback(
    (seatsToUse: Seat[]) => {
      deps.setAutoRedHerringInfo?.(null);
      const active = seatsToUse.filter((s) => s.role);

      const processedSeats = active.map((seat) => {
        if (!seat.role) return seat;

        let nextDisplayRole = seat.displayRole;

        // 酒鬼：需要镇民伪装（优先已有的 charadeRole）
        if (
          seat.role.setupMeta?.isDrunk ||
          seat.role.id === 'drunk' ||
          seat.role.id === 'drunk_mr'
        ) {
          nextDisplayRole = seat.charadeRole || nextDisplayRole || seat.role;
        }

        // 疯子：需要恶魔伪装（若已有 displayRole 则保留）
        if (seat.role.setupMeta?.isLunatic || seat.role.id === 'lunatic') {
          nextDisplayRole = nextDisplayRole || seat.displayRole || seat.role;
        }

        if (!nextDisplayRole) {
          nextDisplayRole = seat.role;
        }

        return {
          ...seat,
          displayRole: nextDisplayRole,
        };
      });

      const compact = processedSeats.map((s, i) => ({ ...s, id: i }));

      try {
        deps.generateNightTimeline?.(compact, true);
      } catch {
        // 时间线生成失败也继续流程
      }

      setTimeout(() => {
        const withRed = [...compact];
        const hasFortuneTeller = withRed.some((s) => s.role?.id === 'fortune_teller');
        if (hasFortuneTeller && !withRed.some((s) => s.isRedHerring)) {
          const good = withRed.filter(
            (s) =>
              ['townsfolk', 'outsider'].includes(s.role?.type || '') &&
              deps.isGoodAlignment?.(s)
          );
          if (good.length > 0) {
            const t = deps.getRandom?.(good);
            if (t) {
              withRed[t.id] = {
                ...withRed[t.id],
                isRedHerring: true,
                statusDetails: [...(withRed[t.id].statusDetails || []), '天敌红罗剎'],
              };
              const redRoleName = withRed[t.id].role?.name || '未知角色';
              deps.addLog?.(`天敌红罗剎分配${t.id + 1}号：${redRoleName}`);
              deps.setAutoRedHerringInfo?.(`${t.id + 1}号：${redRoleName}`);
            }
          }
        }

        const hasUndertaker = withRed.some((s) => s.role?.id === 'undertaker');
        if (hasUndertaker) {
          deps.addLog?.(
            `送葬者：只在非首夜的夜晚被唤醒，且只会看到"今天黄昏被处决并死亡的玩家"`
          );
        }

        deps.setSeats?.(withRed);
        deps.setInitialSeats?.(JSON.parse(JSON.stringify(withRed)));
        base.setGamePhase('check');
      }, 100);
    },
    [base.setGamePhase, deps]
  );

  const handlePreStartNight = useCallback(() => {
    const seatsToUse = deps.seats ?? [];
    proceedToCheckPhase(seatsToUse);
  }, [deps.seats, proceedToCheckPhase]);

  const closeNightOrderPreview = useCallback(() => {
    deps.setCurrentModal?.(null);
    deps.setPendingNightQueue?.(null);
  }, [deps]);

  const confirmNightOrderPreview = useCallback(() => {
    deps.setCurrentModal?.(null);

    if (!deps.pendingNightQueue || deps.pendingNightQueue.length === 0) {
      deps.setPendingNightQueue?.(null);
      deps.setWakeQueueIds?.([]);
      deps.setCurrentWakeIndex?.(0);
      deps.setSelectedActionTargets?.([]);
      deps.setInspectionResult?.(null);
      base.setGamePhase('firstNight');
      deps.addLog?.('首夜：无需要唤醒的角色，直接进入天亮阶段');
      return;
    }

    if (!deps.finalizeNightStart) {
      deps.setPendingNightQueue?.(null);
      return;
    }

    try {
      deps.finalizeNightStart(deps.pendingNightQueue, true);
    } catch (error) {
      deps.setPendingNightQueue?.(null);
    }
  }, [base.setGamePhase, deps]);

  const handleStartNight = useCallback(
    (isFirst: boolean) => {
      if (!deps.startNightImpl) {
        alert('游戏状态错误：无法开始夜晚。请刷新页面重试。');
        return;
      }

      try {
        // 占卜师的天敌红罗剎：若当前标记不在善良玩家身上（例如后续阵营变化），需要重新指派
        if (deps.setSeats && deps.isGoodAlignment) {
          deps.setSeats((prev) => {
            const hasFT = prev.some((s) => s.role?.id === 'fortune_teller');
            if (!hasFT) return prev;

            const current = prev.find((s) => (s as any).isRedHerring);
            const currentIsValidGood = !!current && deps.isGoodAlignment!(current);
            if (currentIsValidGood) return prev;

            const candidates = prev.filter(
              (s) =>
                ['townsfolk', 'outsider'].includes(s.role?.type || '') &&
                deps.isGoodAlignment!(s) &&
                !(s as any).isRedHerring
            );
            if (candidates.length === 0) return prev;

            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            const next = prev.map((s) => {
              if ((s as any).isRedHerring) {
                return {
                  ...(s as any),
                  isRedHerring: false,
                  statusDetails: (((s as any).statusDetails || []) as string[]).filter((x) => x !== '天敌红罗剎'),
                } as any;
              }
              if ((s as any).id === (chosen as any).id) {
                return {
                  ...(s as any),
                  isRedHerring: true,
                  statusDetails: [...(((s as any).statusDetails || []) as string[]), '天敌红罗剎'],
                } as any;
              }
              return s;
            });

            const redRoleName = (chosen as any).role?.name || '未知角色';
            deps.addLog?.(`天敌红罗剎重新指派至${(chosen as any).id + 1}号：${redRoleName}`);
            deps.setAutoRedHerringInfo?.(`${(chosen as any).id + 1}号：${redRoleName}`);
            return next as any;
          });
        }

        startNight(isFirst);
      } catch (error) {
        alert(`入夜时发生错误: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [deps, startNight]
  );

  // CRITICAL FIX: Synchronous transition to First Night (ported from controller)
  const proceedToFirstNight = useCallback(() => {
    const seats = deps.seats || [];
    const roles = deps.roles || [];

    // 0) 酒鬼伪装身份选择：若存在未选择伪装的酒鬼，先弹窗并中断流程
    const drunkSeatsNeedingCharade = seats.filter((s: any) => s.role?.id === 'drunk' && !s.charadeRole);
    if (drunkSeatsNeedingCharade.length > 0) {
      const drunkSeat = drunkSeatsNeedingCharade[0];

      const isRoleInCurrentScript = (r: Role): boolean => {
        const selectedScript: any = deps.selectedScript;
        if (!selectedScript) return true;
        return (
          (r as any).script === selectedScript.name ||
          (selectedScript.id === 'trouble_brewing' && !(r as any).script) ||
          (selectedScript.id === 'bad_moon_rising' && (!(r as any).script || (r as any).script === '暗月初升')) ||
          (selectedScript.id === 'sects_and_violets' && (!(r as any).script || (r as any).script === '梦陨春宵')) ||
          (selectedScript.id === 'midnight_revelry' && (!(r as any).script || (r as any).script === '夜半狂欢'))
        );
      };

      const occupiedRoleIds = new Set<string>();
      for (const s of seats as any[]) {
        if (s.role?.id) occupiedRoleIds.add(s.role.id);
        if (s.charadeRole?.id) occupiedRoleIds.add(s.charadeRole.id);
        if (s.displayRole?.id) occupiedRoleIds.add(s.displayRole.id);
      }

      const availableTownsfolkRoles = roles.filter((r: any) => {
        if (r.type !== 'townsfolk') return false;
        if (r.hidden) return false;
        if (!isRoleInCurrentScript(r)) return false;
        if (occupiedRoleIds.has(r.id)) return false; // 不在场
        return true;
      });

      if (availableTownsfolkRoles.length > 0) {
        deps.setCurrentModal?.({
          type: 'DRUNK_CHARADE_SELECT',
          data: {
            seatId: (drunkSeat as any).id,
            availableRoles: availableTownsfolkRoles,
            scriptId: (deps.selectedScript as any)?.id || '',
          },
        });
        return;
      } else {
        alert('错误：没有可用的镇民角色作为酒鬼的伪装身份。');
        if (deps.setSeats) {
          deps.setSeats((prevSeats: any[]) =>
            prevSeats.map((s: any) => {
              if (s.id === (drunkSeat as any).id) {
                return { ...s, charadeRole: roles.find((r: any) => r.id === 'villager') || null, isDrunk: true };
              }
              return s;
            })
          );
        }
        deps.addLog?.(`警告：没有可用的镇民角色作为${(drunkSeat as any).id + 1}号酒鬼的伪装身份，自动设置为村民。`);
      }
    }

    if (!seats || seats.length === 0) {
      alert('错误：没有座位数据，无法入夜。');
      return;
    }
    if (!deps.generateNightTimeline) {
      alert('错误：缺少夜晚时间轴生成器，无法入夜。');
      return;
    }

    let newTimeline: any[];
    try {
      newTimeline = deps.generateNightTimeline(seats, true);
      if (newTimeline.length === 0) {
        newTimeline = [
          {
            id: 'dawn_step',
            type: 'dawn',
            order: 99999,
            content: { title: '天亮了', script: '所有玩家请睁眼', instruction: '点击进入白天阶段' },
            interaction: {
              type: 'none',
              amount: 0,
              required: false,
              canSelectSelf: false,
              canSelectDead: false,
              effect: { type: 'none' },
            },
          },
        ];
      }
    } catch (error) {
      alert(`生成时间轴失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return;
    }

    const wakeQueueIds = newTimeline
      .filter((step: any) => step.type === 'character' && step.seatId !== undefined)
      .map((step: any) => step.seatId)
      .filter((id: number, index: number, arr: number[]) => arr.indexOf(id) === index);

    deps.setWakeQueueIds?.(wakeQueueIds);
    deps.setCurrentWakeIndex?.(0);
    deps.setSelectedActionTargets?.([]);
    deps.setInspectionResult?.(null);
    base.setGamePhase('firstNight');
    deps.setCurrentModal?.(null);
    deps.setPendingNightQueue?.(null);
  }, [base.setGamePhase, deps]);

  const tickTimer = useCallback(
    (delta: number) => {
      base.setTimer(prev => Math.max(0, prev + delta));
    },
    [base.setTimer]
  );

  return useMemo(() => {
    return {
      gamePhase: base.gamePhase,
      setGamePhase: base.setGamePhase,
      nightCount: base.nightCount,
      setNightCount: base.setNightCount,
      timer: base.timer,
      setTimer: base.setTimer,
      isTimerRunning,
      handleTimerPause,
      handleTimerStart,
      handleTimerReset,
      startNight,
      enterNightPhase,
      enterDayPhase,
      enterDuskPhase,
      handleDayEndTransition,
      handleSwitchScript,
      handleNewGame,
      closeNightOrderPreview,
      confirmNightOrderPreview,
      proceedToCheckPhase,
      handlePreStartNight,
      handleStartNight,
      proceedToFirstNight,
      tickTimer,
    };
  }, [
    base.gamePhase,
    base.nightCount,
    base.timer,
    base.setGamePhase,
    base.setNightCount,
    base.setTimer,
    isTimerRunning,
    handleTimerPause,
    handleTimerStart,
    handleTimerReset,
    startNight,
    enterNightPhase,
    enterDayPhase,
    enterDuskPhase,
    handleDayEndTransition,
    handleSwitchScript,
    handleNewGame,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    proceedToCheckPhase,
    handlePreStartNight,
    handleStartNight,
    proceedToFirstNight,
    tickTimer,
  ]);
}

