/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  groupedRoles,
  type Role,
  roles,
  type Seat,
  scripts,
} from "../../app/data";
import { gameActions, useGameContext } from "../contexts/GameContext";
import { getRoleDefinition } from "../roles";
import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import type { GameRecord } from "../types/game";
import { executeNightAbility } from "../utils/abilityExecutor";
import { generateDynamicNightQueue } from "../utils/dynamicQueueGenerator";
import {
  addPoisonMark,
  computeIsPoisoned,
  getAliveNeighbors,
  getMisinformation,
  getRandom,
  getSeatPosition,
  isActionAbility,
  isActorDisabledByPoisonOrDrunk,
  isEvil,
  isGoodAlignment,
} from "../utils/gameRules";
import {
  createSnapshotFromState,
  saveCurrentSnapshot,
} from "../utils/persistence";
import { showAlert } from "../utils/nativeDialogShim";
import { unifiedEventBus } from "../utils/unifiedEventBus";
import {
  isZombuulNightImmune,
  markZombuulNightSaved,
} from "../utils/zombuulImmunity";
import { executePoisonAction } from "./roleActionHandlers";
import { useAbilityState } from "./useAbilityState";
import { useConfirmHandlers } from "./useConfirmHandlers";
import { useDayActions } from "./useDayActions";
import { useExecutionHandlers } from "./useExecutionHandlers";
import { useGameFlow } from "./useGameFlow";
import { useGameRecords } from "./useGameRecords";
import { useGameState } from "./useGameState";
import { useHistoryController } from "./useHistoryController";
import { useInteractionHandler } from "./useInteractionHandler";
import { useLogicDispatcher } from "./useLogicDispatcher";
import { useNightActionHandler } from "./useNightActionHandler";
import { ENGINE_CONFIG, useNightEngine } from "./useNightEngine";
import { useNightSnapshot } from "./useNightSnapshot";
import { useRegistrationManager } from "./useRegistrationManager";
import { useSeatManager } from "./useSeatManager";
import { useSetupManager } from "./useSetupManager";
import { useVillageState } from "./useVillageState";

const cleanseSeatStatuses = (
  seat: Seat,
  opts?: { keepDeathState?: boolean }
): Seat => {
  const preservedDetails = (seat.statusDetails || []).filter(
    (detail) => detail === "永久中毒"
  );
  const preservedStatuses = (seat.statuses || []).filter(
    (st) => st.duration === "permanent"
  );
  return {
    ...seat,
    isPoisoned: preservedDetails.includes("永久中毒"),
    isDrunk: false,
    isSentenced: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    isGoodConverted: false,
    statusDetails: preservedDetails,
    statuses: preservedStatuses,
    isFirstDeathForZombuul: opts?.keepDeathState
      ? seat.isFirstDeathForZombuul
      : false,
    isDead: opts?.keepDeathState ? seat.isDead : false,
  };
};

const addDrunkMark = (seat: Seat, drunkType: string, clearTime: string) => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];
  const markText = `${drunkType}致醉${clearTime}清除`;
  return {
    statusDetails: [...details.filter((d) => !d.includes(drunkType)), markText],
    statuses: [...statuses, { effect: "Drunk", duration: clearTime }],
  };
};

const _getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role =
    seat.role?.id === "drunk" || seat.role?.id === "marionette"
      ? seat.charadeRole || seat.role
      : seat.role;
  return role ? role.id : null;
};

export function useGameController() {
  const gameState = useGameState();
  const {
    seats,
    setSeats,
    initialSeats,
    setInitialSeats,
    gamePhase,
    setGamePhase,
    nightCount,
    setNightCount,
    deadThisNight,
    setDeadThisNight,
    selectedScript,
    wakeQueueIds,
    setWakeQueueIds,
    currentWakeIndex,
    setCurrentWakeIndex,
    currentModal,
    setCurrentModal,
    isVortoxWorld,
    setIsVortoxWorld,
    lastDuskExecution,
    setLastDuskExecution,
    poppyGrowerDead,
    setPoppyGrowerDead,
    spyDisguiseMode,
    spyDisguiseProbability,
    balloonistKnownTypes,
    setBalloonistKnownTypes,
    todayDemonVoted,
    setTodayDemonVoted,
    todayMinionNominated,
    setTodayMinionNominated,
    todayExecutedId,
    setTodayExecutedId,
    votedThisRound,
    setVotedThisRound,
    outsiderDiedToday,
    setOutsiderDiedToday,
    gameLogs,
    setGameLogs,
    executedPlayerId,
    setExecutedPlayerId,
    currentDuskExecution,
    setCurrentDuskExecution,
    hasExecutedThisDay,
    setHasExecutedThisDay,
    selectedActionTargets,
    setSelectedActionTargets,
    gossipTrueTonight,
    gossipSourceSeatId,
    setGossipTrueTonight,
    setGossipSourceSeatId,
    setGossipStatementToday,
    setEvilTwinPair,
    pukkaPoisonQueue,
    setPukkaPoisonQueue,
    poChargeState,
    setPoChargeState,
    winResult,
    setWinResult,
    winReason,
    setWinReason,
    startTime,
    setStartTime,
    timer,
    setTimer,
    klutzChoiceTarget,
    setKlutzChoiceTarget,
    hadesiaChoices,
    setHadesiaChoices,
    mastermindFinalDay,
    setMastermindFinalDay,
    goonDrunkedThisNight,
    setGoonDrunkedThisNight,
    nominationMap,
    setNominationMap,
    nominationRecords,
    setNominationRecords,
    voteRecords,
    setVoteRecords,
    nightOrderPreview,
    nightQueuePreviewTitle,
    setNightQueuePreviewTitle,
    selectedRole,
    setInspectionResultKey,
    victorySnapshot,
    setVictorySnapshot,
    setMayorRedirectTarget,
    setGameRecords,
    setIsPortrait,
    setMounted,
    mounted,
    setVoteInputValue,
    setShowVoteErrorToast,
    balloonistCompletedIds,
    setBalloonistCompletedIds,
    currentHint,
    setInspectionResult,
    setWitchActive,
    setWitchCursedId,
    setCerenovusTarget,
    setPendingNightQueue,
    setNightOrderPreview,
    witchActive,
    witchCursedId,
    cerenovusTarget,
  } = gameState;

  // 🔧 守鸦人修复：wakeQueueIds 的最新值引用（动态插入的守鸦人节点通过
  //   setWakeQueueIds 函数式更新写入，同步到 ref 供 useNightSnapshot 的
  //   continueToNextAction/updateSnapshot 读取，避免闭包旧值跳过插入节点）
  const wakeQueueIdsRef = useRef<number[]>([]);
  // 复盘日志全局序号：保证同毫秒内多条日志的先后顺序稳定。
  const logSeqRef = useRef(0);
  useEffect(() => {
    wakeQueueIdsRef.current = wakeQueueIds;
  }, [wakeQueueIds]);

  const getSeatRoleId = useCallback(
    (seatOrId: Seat | number | null | undefined) => {
      if (typeof seatOrId === "number") {
        const s = seats.find((x) => x.id === seatOrId);
        return s?.role?.id || null;
      }
      return seatOrId?.role?.id || null;
    },
    [seats]
  );

  const getDisplayRoleType = useCallback((seat: Seat | null | undefined) => {
    if (!seat || !seat.role) return "townsfolk";
    // 说书人魔典圆桌视角：座位代币底色与光晕反映玩家的真实角色类型（如酒鬼为外来者绿色，提线木偶为爪牙暗橙）
    return seat.role.type || "townsfolk";
  }, []);

  const formatTimer = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const { dispatch: baseDispatch } = useGameContext();
  const [systemStepRoleIds, setSystemStepRoleIds] = useState<
    Map<number, string>
  >(new Map());
  const systemStepRoleIdsRef = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    systemStepRoleIdsRef.current = systemStepRoleIds;
  }, [systemStepRoleIds]);

  const findNearestAliveNeighbor = useCallback(
    (originId: number, direction: 1 | -1) => {
      const originIndex = seats.findIndex((s) => s.id === originId);
      if (originIndex === -1 || seats.length <= 1) return null;
      for (let step = 1; step < seats.length; step++) {
        const seat =
          seats[(originIndex + direction * step + seats.length) % seats.length];
        if (!seat.isDead && seat.id !== originId) return seat;
      }
      return null;
    },
    [seats]
  );
  const seatManager = useSeatManager();
  const historyController = useHistoryController();
  const village = useVillageState();

  // 🔧 跨角色状态时序统一机制（W8.14.12）：
  //   seatsRef = "最新座位"的同步镜像（渲染期 + commitSeats 双路同步）。
  //   commitSeats 兼容函数式/值更新，以 seatsRef.current 为 prev 同步计算并
  //   立即写回 ref——任何 handler 里 commitSeats(prev=>...) 都自动获得"改状态后
  //   ref 立即更新"语义；后续角色 guide 生成（无参 continueToNextAction）读
  //   共享 seatsRef 即最新座位，保证"角色 A 行动改角色 B 状态 → 角色 B 行动
  //   时实时感知"（修复投毒者→洗衣妇时序 P0 的系统性方案，覆盖所有角色）。
  const seatsRef = useRef<Seat[]>(seats);
  seatsRef.current = seats; // 渲染期同步（React commit 后 state 已更新）
  const commitSeats = useCallback(
    (next: Seat[] | ((prev: Seat[]) => Seat[])) => {
      const resolved =
        typeof next === "function"
          ? (next as (p: Seat[]) => Seat[])(seatsRef.current)
          : next;
      seatsRef.current = resolved;
      setSeats(resolved);
    },
    [setSeats]
  );

  const abilities = useAbilityState(nightCount, commitSeats);
  const registration = useRegistrationManager(
    gamePhase,
    nightCount,
    spyDisguiseMode,
    spyDisguiseProbability
  );
  const gameFlow = useGameFlow();
  const nightActionHandler = useNightActionHandler();
  const setupManager = useSetupManager(seats, commitSeats);

  const setGameRecordsProp = useCallback(
    (val: React.SetStateAction<GameRecord[]>) => {
      setGameRecords((prev) =>
        typeof val === "function" ? (val as any)(prev) : val
      );
    },
    [setGameRecords]
  );
  const { loadGameRecords, saveGameRecord } = useGameRecords({
    setGameRecords: setGameRecordsProp,
  });

  const { changeRole, swapRoles, swapSeats, reviveSeat } = seatManager;
  const {
    saveHistory,
    handleStepBack: rawHandleStepBack,
    handleGlobalUndo,
  } = historyController;
  const wrappedHandleStepBack = useCallback(() => {
    rawHandleStepBack();
  }, [rawHandleStepBack]);
  const {
    hasUsedAbility,
    markAbilityUsed,
    hasUsedDailyAbility,
    markDailyAbilityUsed,
  } = abilities;
  const {
    registrationCacheRef,
    resetRegistrationCache,
    getRegistrationCached,
  } = registration;
  const {
    handleSwitchScript,
    handleNewGame,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    proceedToFirstNight,
    proceedToCheckPhase,
    handlePreStartNight,
    handleStartNight,
    handleTimerPause,
    handleTimerStart,
    handleTimerReset,
    isTimerRunning,
    enterDayPhase,
    enterDuskPhase,
    handleDayEndTransition,
    confirmNightDeathReport,
  } = gameFlow;

  const addLog = useCallback(
    (msg: string) => {
      logSeqRef.current += 1;
      village.setGameLogs((p) => [
        ...(p as any),
        {
          day: gamePhase === "setup" ? 0 : nightCount,
          phase: gamePhase,
          message: msg,
          ts: Date.now(),
          seq: logSeqRef.current,
        },
      ]);
    },
    [village, nightCount, gamePhase]
  );

  const addLogWithDeduplication = useCallback(
    (msg: string, playerId?: number, roleName?: string) => {
      village.setGameLogs((prev: any[]) => {
        const filtered =
          playerId !== undefined && roleName
            ? prev.filter(
                (log) =>
                  !(
                    log.message.includes(`${playerId + 1}号(${roleName})`) &&
                    log.phase === gamePhase
                  )
              )
            : prev;
        logSeqRef.current += 1;
        return [
          ...filtered,
          {
            day: gamePhase === "setup" ? 0 : nightCount,
            phase: gamePhase,
            message: msg,
            ts: Date.now(),
            seq: logSeqRef.current,
          },
        ];
      });
    },
    [village, nightCount, gamePhase]
  );

  const insertIntoWakeQueueAfterCurrent = useCallback(
    (id: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
      setWakeQueueIds((prev: number[]) => {
        if (prev.includes(id)) return prev;
        const processed = prev.slice(0, currentWakeIndex + 1);
        const rest = prev.slice(currentWakeIndex + 1);
        const effectiveRole =
          opts?.roleOverride || seats.find((s) => s.id === id)?.role;
        if (!effectiveRole) return [...processed, id, ...rest];
        const getOrder = (sid: number) => {
          const s = seats.find((x) => x.id === sid);
          const r =
            s?.role?.id === "drunk" || s?.role?.id === "marionette"
              ? s.charadeRole
              : s?.role;
          return gamePhase === "firstNight"
            ? (r?.firstNightOrder ?? 999)
            : (r?.otherNightOrder ?? 999);
        };
        const order =
          gamePhase === "firstNight"
            ? (effectiveRole.firstNightOrder ?? 999)
            : (effectiveRole.otherNightOrder ?? 999);
        const insertAt = rest.findIndex((rid) => order < getOrder(rid));
        const nextRest = [...rest];
        if (insertAt >= 0) nextRest.splice(insertAt, 0, id);
        else nextRest.push(id);
        return [...processed, ...nextRest];
      });
      if (opts?.logLabel) addLog(`${opts.logLabel} 已加入本夜唤醒队列`);
    },
    [gamePhase, currentWakeIndex, seats, setWakeQueueIds, addLog]
  );

  const killPlayer = useCallback(
    (targetId: number, options: any = {}) => {
      const {
        source = "ability",
        recordNightDeath = true,
        onAfterKill,
      } = options;

      // 首先处理死亡逻辑
      commitSeats((prev: Seat[]) => {
        // 🧟 僵怖豁免：僵怖夜晚被杀死不真死（仅处决能杀死僵怖）
        const targetBefore = prev.find((s) => s.id === targetId);
        if (targetBefore && isZombuulNightImmune(targetBefore, source)) {
          return prev.map((s) =>
            s.id === targetId ? markZombuulNightSaved(s, source) : s
          );
        }
        let updatedSeats = prev.map((s) => {
          if (s.id !== targetId || s.isDead) return s;
          const next = {
            ...s,
            isDead: true,
            diedOnDay: nightCount,
            deathSource: source,
          };
          // 🔧 送葬者修复：处决时保存被处决者角色快照 + executedToday 标记
          // （处决后角色可能因红唇女郎等变化，需保存处决时刻的真实角色）
          if (source === "execution") {
            next.executedToday = true;
            next.executedRoleSnapshot =
              s.role?.name ||
              (s as any).effectiveRole?.name ||
              (s as any).charadeRole?.name ||
              "未知角色";
          }
          return next;
        });

        // 红罗刹死亡自动转移逻辑
        const targetSeat = updatedSeats.find((s) => s.id === targetId);
        if (targetSeat?.isRedHerring) {
          // 检查是否存在存活的占卜师
          const hasFortuneTeller = updatedSeats.some(
            (s) => s.role?.id === "fortune_teller" && !s.isDead
          );
          if (hasFortuneTeller) {
            // 筛选所有存活的善良玩家（镇民/外来者），排除刚死亡的红罗刹
            const goodCandidates = updatedSeats.filter(
              (s) =>
                !s.isDead &&
                ["townsfolk", "outsider"].includes(s.role?.type || "") &&
                !s.isEvilConverted &&
                (s as any).alignment !== "evil" &&
                isGoodAlignment(s) &&
                s.id !== targetId
            );
            if (goodCandidates.length > 0) {
              const newRedHerring = getRandom(goodCandidates);
              updatedSeats = updatedSeats.map((s) => ({
                ...s,
                isRedHerring: s.id === newRedHerring.id,
                isFortuneTellerRedHerring: s.id === newRedHerring.id,
                statusDetails:
                  s.id === newRedHerring.id
                    ? [...(s.statusDetails || []), "天敌红罗剎"]
                    : (s.statusDetails || []).filter((d) => d !== "天敌红罗剎"),
              }));
              addLog(
                `天敌红罗剎已从${targetId + 1}号转移至${newRedHerring.id + 1}号玩家`
              );
            }
          }
        }

        // 占卜师死亡时，移除所有红罗刹状态
        if (targetSeat?.role?.id === "fortune_teller") {
          const hadRedHerring = updatedSeats.some(
            (s) => s.isRedHerring || s.isFortuneTellerRedHerring
          );
          if (hadRedHerring) {
            updatedSeats = updatedSeats.map((s) => ({
              ...s,
              isRedHerring: false,
              isFortuneTellerRedHerring: false,
              statusDetails: (s.statusDetails || []).filter(
                (d) => d !== "天敌红罗剎"
              ),
            }));
            addLog("占卜师已死亡，红罗刹状态已移除");
          }
        }

        // 🌺 罂粟种植者死亡处理：若在未中毒未醉酒状态下死亡，触发邪恶互认
        if (targetSeat?.role?.id === "poppy_grower") {
          if (!targetSeat.isDrunk && !targetSeat.isPoisoned) {
            setPoppyGrowerDead(true);
            addLog("🌺 罂粟种植者已死亡！恶魔与爪牙将在当晚互相认识。");
          } else {
            addLog(
              "🌺 罂粟种植者在醉酒/中毒状态下死亡，能力未生效，邪恶阵营无法互相认识。"
            );
          }
        }

        return updatedSeats;
      });

      if (recordNightDeath)
        setDeadThisNight((prev: number[]) =>
          prev.includes(targetId) ? prev : [...prev, targetId]
        );
      if (getSeatRoleId(targetId) === "outsider") setOutsiderDiedToday(true);
      if (onAfterKill) onAfterKill();
    },
    [
      commitSeats,
      setDeadThisNight,
      nightCount,
      setOutsiderDiedToday,
      getSeatRoleId,
      addLog,
      setPoppyGrowerDead,
    ]
  );

  const convertPlayerToEvil = useCallback(
    (targetId: number) => {
      commitSeats((prev: Seat[]) =>
        prev.map((s) =>
          s.id === targetId
            ? cleanseSeatStatuses(
                {
                  ...s,
                  isEvilConverted: true,
                  isDemonSuccessor: false,
                  charadeRole: null,
                },
                { keepDeathState: true }
              )
            : s
        )
      );
      insertIntoWakeQueueAfterCurrent(targetId, {
        logLabel: `${targetId + 1}号转为邪恶`,
      });
    },
    [commitSeats, insertIntoWakeQueueAfterCurrent]
  );

  const cleanStatusesForNewDay = useCallback(() => {
    commitSeats((prev: Seat[]) =>
      prev.map((s) => {
        const remaining = (s.statuses || []).filter(
          (st) => st.effect === "ExecutionProof" || st.duration !== "Night"
        );
        const details = (s.statusDetails || []).filter(
          (st) =>
            st.includes("永久") ||
            st.includes("普卡中毒") ||
            !st.includes("清除")
        );
        return {
          ...s,
          statuses: remaining,
          statusDetails: details,
          isPoisoned: computeIsPoisoned({
            ...s,
            statuses: remaining,
            statusDetails: details,
          }),
        };
      })
    );
  }, [commitSeats]);

  const getDemonDisplayName = useCallback((id?: string, f?: string) => {
    const map: any = {
      hadesia: "哈迪寂亚",
      vigormortis: "亡骨魔",
      imp: "小恶魔",
      zombuul: "僵怖",
      shabaloth: "沙巴洛斯",
      fang_gu: "方古",
      no_dashii: "诺-达",
      vortox: "涡流",
      po: "珀",
    };
    return map[id || ""] || f || "恶魔";
  }, []);

  // 从对局记录快照恢复游戏
  const handleContinueGame = useCallback(
    (record: GameRecord) => {
      if (!record.snapshot) return;
      const snap = record.snapshot;

      const script = scripts.find((s) => s.name === record.scriptName);
      const updates: Record<string, any> = {
        gamePhase: snap.gamePhase || "setup",
        nightCount: snap.nightCount ?? 1,
        seats: snap.seats || [],
        initialSeats: snap.initialSeats || [],
        victorySnapshot: snap.victorySnapshot || [],
        winResult: snap.winResult || null,
        winReason: snap.winReason || null,
        deadThisNight: snap.deadThisNight || [],
        executedPlayerId: snap.executedPlayerId ?? null,
        wakeQueueIds: snap.wakeQueueIds || [],
        currentWakeIndex: snap.currentWakeIndex ?? 0,
        selectedActionTargets: snap.selectedActionTargets || [],
        inspectionResult: snap.inspectionResult ?? null,
        inspectionResultKey: snap.inspectionResultKey ?? 0,
        todayDemonVoted: snap.todayDemonVoted ?? false,
        todayMinionNominated: snap.todayMinionNominated ?? false,
        todayExecutedId: snap.todayExecutedId ?? null,
        witchCursedId: snap.witchCursedId ?? null,
        witchActive: snap.witchActive ?? false,
        cerenovusTarget: snap.cerenovusTarget ?? null,
        isVortoxWorld: snap.isVortoxWorld ?? false,
        fangGuConverted: snap.fangGuConverted ?? false,
        jugglerGuesses: snap.jugglerGuesses ?? null,
        evilTwinPair: snap.evilTwinPair ?? null,
        outsiderDiedToday: snap.outsiderDiedToday ?? false,
        gossipStatementToday: snap.gossipStatementToday ?? "",
        gossipTrueTonight: snap.gossipTrueTonight ?? false,
        gossipSourceSeatId: snap.gossipSourceSeatId ?? null,
        timer: snap.timer ?? 0,
        startTime: snap.startTime ? new Date(snap.startTime) : null,
        selectedRole: snap.selectedRole ?? null,
        spyDisguiseMode: snap.spyDisguiseMode ?? "off",
        spyDisguiseProbability: snap.spyDisguiseProbability ?? 0,
        poppyGrowerDead: snap.poppyGrowerDead ?? false,
        pukkaPoisonQueue: snap.pukkaPoisonQueue || [],
        poChargeState: snap.poChargeState ?? null,
        usedOnceAbilities: snap.usedOnceAbilities || {},
        usedDailyAbilities: snap.usedDailyAbilities || {},
        balloonistKnownTypes: snap.balloonistKnownTypes || {},
        hasExecutedThisDay: snap.hasExecutedThisDay ?? false,
        votedThisRound: snap.votedThisRound || [],
        lastDuskExecution: snap.lastDuskExecution ?? null,
        currentDuskExecution: snap.currentDuskExecution ?? null,
        history: snap.history || [],
        mayorRedirectTarget: snap.mayorRedirectTarget ?? null,
        damselGuessed: snap.damselGuessed ?? false,
        damselGuessUsedBy: snap.damselGuessUsedBy || [],
        klutzChoiceTarget: snap.klutzChoiceTarget ?? null,
        shamanKeyword: snap.shamanKeyword ?? null,
        shamanTriggered: snap.shamanTriggered ?? false,
        shamanConvertTarget: snap.shamanConvertTarget ?? null,
        autoRedHerringInfo: snap.autoRedHerringInfo ?? null,
        dayAbilityLogs: snap.dayAbilityLogs || [],
        nominationMap: snap.nominationMap || {},
        nominationRecords: snap.nominationRecords || {
          nominators: [],
          nominees: [],
        },
        mastermindFinalDay: snap.mastermindFinalDay ?? null,
        remainingDays: snap.remainingDays ?? null,
        goonDrunkedThisNight: snap.goonDrunkedThisNight ?? false,
        hadesiaChoices: snap.hadesiaChoices || {},
        virginGuideInfo: snap.virginGuideInfo ?? null,
        voteRecords: snap.voteRecords || [],
        seatNotes: snap.seatNotes || {},
        hadesiaChoiceEnabled: snap.hadesiaChoiceEnabled ?? false,
        lastExecutedPlayerId: snap.lastExecutedPlayerId ?? null,
      };
      if (script) updates.selectedScript = script;
      baseDispatch(gameActions.updateState(updates));
    },
    [baseDispatch]
  );

  const { logicDispatch, checkGameOver, declareMayorImmediateWin, victoryRef } =
    useLogicDispatcher(
      seats,
      commitSeats,
      gamePhase,
      setGamePhase,
      addLog,
      setWinResult,
      setWinReason,
      setCurrentModal,
      setExecutedPlayerId,
      setTodayExecutedId,
      setCurrentDuskExecution,
      setHasExecutedThisDay,
      isVortoxWorld,
      setVictorySnapshot
    );

  const nightSnapshot = useNightSnapshot(
    seats,
    selectedScript,
    gamePhase,
    setGamePhase,
    nightCount,
    systemStepRoleIds,
    lastDuskExecution,
    isEvil,
    poppyGrowerDead,
    spyDisguiseMode,
    spyDisguiseProbability,
    deadThisNight,
    balloonistKnownTypes,
    registrationCacheRef.current,
    isVortoxWorld,
    todayDemonVoted,
    todayMinionNominated,
    todayExecutedId,
    hasUsedAbility,
    votedThisRound,
    outsiderDiedToday,
    wakeQueueIds,
    currentWakeIndex,
    setCurrentWakeIndex,
    addLog,
    setCurrentModal,
    wakeQueueIdsRef,
    seatsRef,
    systemStepRoleIdsRef,
    saveHistory
  );
  const {
    activeNightStep: nightInfo,
    continueToNextAction: rawContinueToNextAction,
    wakeIndexRef,
    hasShownIndexZeroRef,
    setActiveNightStep,
  } = nightSnapshot;

  // 🔧 守鸦人修复：恶魔杀守鸦人后入队觉醒（操作真正驱动夜间 UI 的 wakeQueueIds）。
  //   插入点用 wakeIndexRef.current + 1（当前行动节点之后），不能用 React state
  //   currentWakeIndex（滞后，小恶魔行动时仍是上一个角色的索引，会把守鸦人插到
  //   当前行动节点之前而被跳过）。同时同步写 wakeQueueIdsRef 供
  //   useNightSnapshot 的 continueToNextAction/updateSnapshot 读取最新队列。
  const enqueueRavenkeeperIfNeeded = useCallback(
    (targetId: number) => {
      if (getSeatRoleId(targetId) !== "ravenkeeper") return;
      // 🔧 守鸦人结果不展示修复：入队时同步设置 hasAbilityEvenDead=true，
      //   否则死亡后确认执行时被 preProcessAbility 的"已死亡"校验拦截，
      //   导致守鸦人选择了目标却没有任何结算结果。
      commitSeats((prev: Seat[]) =>
        prev.map((s) =>
          s.id === targetId && !s.hasAbilityEvenDead
            ? { ...s, hasAbilityEvenDead: true }
            : s
        )
      );
      setWakeQueueIds((prev: number[]) => {
        if (prev.includes(targetId)) return prev;
        const insertAt = wakeIndexRef.current + 1;
        const next = [
          ...prev.slice(0, insertAt),
          targetId,
          ...prev.slice(insertAt),
        ];
        wakeQueueIdsRef.current = next;
        return next;
      });
    },
    [wakeIndexRef, setWakeQueueIds, getSeatRoleId, commitSeats]
  );

  // 包装 continueToNextAction，在推进队列前重置预览状态
  // 自动保存游戏快照到 localStorage（仅在真正实质进行中的对局阶段保存，排除 setup/check/scriptSelection/gameOver）
  useEffect(() => {
    const inProgressPhases = [
      "firstNight",
      "night",
      "day",
      "dusk",
      "voting",
      "nightSummary",
    ];
    if (inProgressPhases.includes(gamePhase) && !gameState.winResult) {
      const snapshot = createSnapshotFromState(gameState as any);
      saveCurrentSnapshot(snapshot);
    }
  }, [gamePhase, gameState]);

  const continueToNextAction = useCallback(
    (latestSeats?: Seat[]) => {
      rawContinueToNextAction(latestSeats);
      // BUG FIX: 推进到下一步时必须清除已选目标，否则下一个步骤会沿用旧的目标
      setSelectedActionTargets([]);
    },
    [rawContinueToNextAction, setSelectedActionTargets]
  );

  const nightLogic = useNightEngine({
    seats,
    gamePhase,
    nightCount,
    hasCompletedFirstNight: gameState.hasCompletedFirstNight,
    executedPlayerId,
    wakeQueueIds,
    currentWakeIndex,
    selectedActionTargets,
    gameLogs,
    selectedScript,
    deadThisNight,
    currentDuskExecution,
    pukkaPoisonQueue,
    todayDemonVoted,
    todayMinionNominated,
    todayExecutedId,
    witchCursedId,
    witchActive,
    cerenovusTarget,
    voteRecords,
    nominationMap,
    poChargeState,
    goonDrunkedThisNight,
    isVortoxWorld,
    outsiderDiedToday,
    nightInfo,
    nightQueuePreviewTitle: gameState.nightQueuePreviewTitle,
  });

  const getRoleTargetCount = useCallback(
    (roleId: string, isFirstNight: boolean) => {
      const def = getRoleDefinition(roleId);
      const val = isFirstNight ? def?.firstNight || def?.night : def?.night;
      return val?.target
        ? { min: val.target.count.min, max: val.target.count.max }
        : null;
    },
    []
  );

  const executionHandlers = useExecutionHandlers({
    seats,
    roles,
    nightInfo,
    currentModal,
    gamePhase,
    nightCount,
    nominationMap,
    initialSeats,
    voteRecords,
    isVortoxWorld,
    todayExecutedId,
    mastermindFinalDay,
    winResult,
    winReason,
    setCurrentModal,
    setSeats: commitSeats,
    setSelectedActionTargets,
    setOutsiderDiedToday,
    setWakeQueueIds,
    setDeadThisNight,
    setTodayDemonVoted,
    setTodayExecutedId,
    setVotedThisRound,
    setNominationRecords,
    setNominationMap,
    setWinResult,
    setWinReason,
    setGamePhase,
    setMastermindFinalDay,
    setVoteInputValue,
    setShowVoteErrorToast,
    setWitchCursedId,
    setWitchActive,
    setSystemStepRoleIds,
    systemStepRoleIdsRef,
    addLog,
    addLogWithDeduplication,
    killPlayer,
    continueToNextAction,
    checkGameOver,
    isActorDisabledByPoisonOrDrunk,
    getRegistrationCached,
    saveHistory,
    dispatch: logicDispatch,
    baseDispatch,
    getRandom,
    getAliveNeighbors,
    isGoodAlignment,
    addPoisonMark,
    computeIsPoisoned,
    handleNightAction: nightActionHandler.handleNightAction,
    executePoisonActionFn: executePoisonAction,
    enqueueRavenkeeperIfNeeded,
    nightLogic,
    getMisinformation,
    findNearestAliveNeighbor,
    processingRef: { current: false } as any,
    moonchildChainPendingRef: gameState.moonchildChainPendingRef,
    victoryRef,
    markAbilityUsed,
    hasUsedAbility,
    reviveSeat,
    insertIntoWakeQueueAfterCurrent,
  });
  const {
    executePlayer,
    confirmKill,
    submitVotes,
    executeJudgment,
    confirmPoison,
    confirmPoisonEvil,
    confirmExecutionResult,
    resolveLunaticRps,
    confirmShootResult,
    handleSlayerTargetSelect,
    startSubsequentNight,
  } = executionHandlers;

  const confirmHandlers = useConfirmHandlers({
    nightInfo,
    currentModal,
    seats,
    gamePhase,
    nightCount,
    currentWakeIndex,
    wakeQueueIds,
    deadThisNight,
    klutzChoiceTarget,
    hadesiaChoices,
    currentHint,
    isVortoxWorld,
    gameLogs,
    selectedScript,
    startTime,
    timer,
    setCurrentModal,
    setSeats: commitSeats,
    setSelectedActionTargets,
    setKlutzChoiceTarget,
    setHadesiaChoices,
    setInspectionResult,
    setInspectionResultKey,
    setWakeQueueIds,
    setCurrentWakeIndex,
    setWinResult,
    setWinReason,
    setGamePhase,
    addLog,
    addLogWithDeduplication,
    killPlayer,
    continueToNextAction,
    checkGameOver,
    isEvil,
    isActorDisabledByPoisonOrDrunk,
    addDrunkMark,
    getDemonDisplayName,
    executePlayer,
    saveGameRecord,
    nightLogic,
    moonchildChainPendingRef: gameState.moonchildChainPendingRef,
  });
  const {
    confirmMayorRedirect,
    confirmHadesiaKill,
    confirmMoonchildKill,
    confirmSweetheartDrunk,
    confirmKlutzChoice,
    confirmStorytellerDeath,
    confirmHadesia,
    confirmSaintExecution,
    cancelSaintExecution,
    confirmRavenkeeperFake,
    confirmVirginTrigger,
    confirmRestart,
  } = confirmHandlers;

  const dayActions = useDayActions({
    seats,
    roles,
    currentModal,
    gamePhase,
    nominationMap,
    nominationRecords,
    witchActive,
    witchCursedId,
    virginGuideInfo: gameState.virginGuideInfo,
    dayAbilityForm: gameState.dayAbilityForm,
    setCurrentModal,
    setSeats: commitSeats,
    setNominationMap,
    setNominationRecords,
    setTodayMinionNominated,
    setVirginGuideInfo: gameState.setVirginGuideInfo,
    setWitchCursedId,
    setWitchActive,
    setVoteInputValue,
    setShowVoteErrorToast,
    setExecutedPlayerId,
    setTodayExecutedId,
    setHasExecutedThisDay,
    setCurrentDuskExecution,
    setVfxTrigger: gameState.setVfxTrigger,
    setWinResult,
    setWinReason,
    setGamePhase,
    setDayAbilityForm: gameState.setDayAbilityForm,
    setVotedThisRound,
    addLog,
    killPlayer,
    checkGameOver,
    isActorDisabledByPoisonOrDrunk,
    getRegistrationCached: registration.getRegistrationCached,
    saveHistory,
    hasUsedAbility,
    hasUsedDailyAbility,
    markAbilityUsed,
    markDailyAbilityUsed,
    continueToNextAction,
    proceedToFirstNight,
    changeRole,
    dispatch: logicDispatch,
  });
  const {
    executeNomination,
    cancelNomination,
    handleVirginGuideConfirm,
    handleDayAction,
    handleDrunkCharadeSelect,
    registerVotes,
    handleDayAbilityTrigger,
    handleDayAbility,
    handleViewDayAbilityResult,
  } = dayActions;

  // 确认流程由新引擎管道内部的预览→弹窗→确认机制驱动，不再需要 ref 跟踪
  // 详情见 executeViaNewEngine() 在 useNightActionHandler.ts 中的实现

  const interactionHandlers = useInteractionHandler({
    getRoleTargetCount,
    saveHistory,
    handleConfirmActionImpl: async (selectedTargets?: number[]) => {
      // 保存历史快照，用于"上一步"撤销
      saveHistory();

      // 统一通过 handleNightAction 执行 — 新引擎会自动处理：
      //   preview=true  → preCheck+calculate → 弹出确认窗 → 用户确认
      //   preview=false → 完整 pipeline → 推进队列
      // 旧 handler 路径不受影响（preview 仅在新引擎管道中生效）
      const report = await executeNightAbility(
        (ctx) => nightActionHandler.handleNightAction(ctx),
        {
          nightInfo,
          seats,
          selectedTargets: selectedTargets || [],
          gamePhase,
          nightCount,
          roles: roles || [],
          vortoxWorld: isVortoxWorld,
          // 🔧 送葬者修复：能力管道需要 todayExecutedId 定位被处决者
          todayExecutedId,
          getRegistration: getRegistrationCached,
          getMisinformation: getMisinformation,
          findNearestAliveNeighbor,
          setSeats: commitSeats,
          setSelectedActionTargets,
          // 🔧 新引擎管道（imp.ability 等杀人）不调 killPlayer，需传入
          //   setDeadThisNight 让 executeViaNewEngine 在 markedForDeath 变 isDead 后补记。
          setDeadThisNight,
          // 🔧 女巫诅咒桥接：新引擎快照 witchCurse → legacy witchCursedId（useDayActions 消费端）。
          setWitchCursedId,
          setWitchActive,
          setEvilTwinPair,
          dispatch: baseDispatch,
          // 🔧 恶魔死亡判胜：新引擎击杀恶魔后立即触发胜负判定（否则拖到白天）。
          checkGameOver,
          addLog,
          continueToNextAction,
          setCurrentModal,
          markAbilityUsed,
          hasUsedAbility,
          reviveSeat,
          insertIntoWakeQueueAfterCurrent,
          // 🔧 守鸦人修复：恶魔杀守鸦人后入队觉醒。
          //   必须用本组件的旧版 enqueueRavenkeeperIfNeeded（操作真正驱动夜间
          //   UI 的 wakeQueueIds + 设 hasAbilityEvenDead），不能用 nightLogic
          //   的新引擎版（插入 NightEngine.queue，但该队列不驱动夜间 UI，
          //   且后续夜晚 engine.queueIterator 为 null → 插入无效）。
          enqueueRavenkeeperIfNeeded,
          preview: true, // 始终以预览模式进入，新引擎内部决定是否弹确认窗
        }
      );

      // 如果前置校验阻止了执行，跳过并推进到下一个行动
      if (report.preCheck.blocked) {
        addLog(`[系统] ${report.preCheck.reason || "能力被跳过"}`);
        continueToNextAction();
        return;
      }

      // handler 返回 false 且非 preCheck 阻止 → 系统步骤（demon_info/minion_info）
      // 或旧 handler 未实现此角色：直接推进
      if (!report.handlerResult) {
        console.log(`[系统] 步骤 ${report.roleId} 无 handler 实现，自动推进`);
        continueToNextAction();
        return;
      }

      // 对于旧 handler（handlerInvoked=true 但非新引擎能力），
      // preview 对其无影响，handleNightAction 内部已直接执行+推进；
      // 新引擎能力则由 executeViaNewEngine 接管弹窗→确认→推进流程。
    },
    nightInfo,
  });
  const {
    handleSeatClick: interactionHandleSeatClick,
    toggleStatus: interactionToggleStatus,
    handleMenuAction,
    toggleTarget: interactionToggleTarget,
    isTargetDisabled,
    handleConfirmAction: interactionHandleConfirmAction,
  } = interactionHandlers;

  const getDisplayRoleForSeat = useCallback(
    (seat?: Seat | null): Role | null => {
      const raw =
        seat?.role?.id === "drunk" || seat?.role?.id === "marionette"
          ? seat.charadeRole
          : seat?.role;
      return raw || null;
    },
    []
  );

  const getFilteredRoles = useCallback(
    (list: Role[]) => {
      if (!selectedScript) return [];

      // 如果剧本有 roleIds 字段（包括自定义和官方剧本），直接使用它过滤
      if (selectedScript.roleIds && selectedScript.roleIds.length > 0) {
        const filtered = list.filter((r) =>
          selectedScript.roleIds?.includes(r.id)
        );
        console.log(
          `[DEBUG] Script "${selectedScript.name}" filtered ${filtered.length} roles via roleIds`
        );
        return filtered;
      }

      // 否则回退到旧的 script 字段过滤（向后兼容）
      // 跳过隐藏角色
      const filtered = list.filter((r) => {
        if (r.hidden) return false;

        // 如果没有 script 字段，检查是否属于暗流涌动剧本
        if (!r.script) {
          return selectedScript.id === "trouble_brewing";
        }

        // 有 script 字段：检查是否匹配当前剧本名称
        const matches = r.script === selectedScript.name;
        if (!matches && process.env.NODE_ENV === "development") {
          console.log(
            `[DEBUG] Role ${r.id} (script: "${r.script}") doesn't match script "${selectedScript.name}"`
          );
        }
        return matches;
      });

      console.log(
        `[DEBUG] Official script "${selectedScript.name}" (id: "${selectedScript.id}") filtered ${filtered.length} roles via script field`
      );
      if (process.env.NODE_ENV === "development" && filtered.length === 0) {
        console.log("[DEBUG] Available roles with script fields:");
        list.slice(0, 10).forEach((r) => {
          console.log(`  ${r.id}: script="${r.script}", hidden=${r.hidden}`);
        });
      }

      return filtered;
    },
    [selectedScript]
  );

  const filteredGroupedRoles = useMemo(() => {
    if (!selectedScript) return {} as Record<string, Role[]>;
    return Array.from(
      new Map(getFilteredRoles(roles).map((r) => [r.id, r])).values()
    ).reduce(
      (acc, r) => {
        if (!acc[r.type]) {
          acc[r.type] = [];
        }
        acc[r.type].push(r);
        return acc;
      },
      {} as Record<string, Role[]>
    );
  }, [selectedScript, getFilteredRoles]);

  const onSeatClick = useCallback(
    (id: number, options?: any) => {
      interactionHandleSeatClick(id, options);
    },
    [interactionHandleSeatClick]
  );

  useEffect(() => {
    setIsVortoxWorld(
      seats.some(
        (s) =>
          !s.isDead &&
          (s.role?.id === "vortox" ||
            (s.isDemonSuccessor && s.role?.id === "vortox"))
      )
    );
  }, [seats, setIsVortoxWorld]);
  useEffect(() => {
    if (gamePhase === "scriptSelection")
      (gameState as any).triggerIntroLoading?.();
  }, [gamePhase, (gameState as any).triggerIntroLoading]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 夜间编排 effect 依赖引擎内部状态，超集收集会引发循环刷新
  useEffect(() => {
    if (gamePhase !== "firstNight" && gamePhase !== "night") return;
    if (currentWakeIndex >= (wakeQueueIds?.length || 0)) {
      // 🔧 吟游歌手（Minstrel）被动：夜晚有镇民死亡 → 爪牙醉酒直到明天黄昏
      const townsfolkDied = (deadThisNight || []).some((id: number) => {
        const seat = seats.find((s) => s.id === id);
        return seat?.role?.type === "townsfolk";
      });
      const minstrelAlive = seats.some(
        (s) => s.role?.id === "minstrel" && !s.isDead
      );
      if (townsfolkDied && minstrelAlive) {
        const minionIds = seats
          .filter((s) => !s.isDead && s.role?.type === "minion")
          .map((s) => s.id);
        if (minionIds.length > 0) {
          commitSeats((prev: Seat[]) =>
            prev.map((s) =>
              minionIds.includes(s.id)
                ? {
                    ...s,
                    isDrunk: true,
                    statusEffects: [
                      ...(s.statusEffects ?? []).filter(
                        (e: any) =>
                          !(e.type === "drunk" && e.source === "minstrel")
                      ),
                      {
                        type: "drunk",
                        source: "minstrel",
                        appliedAtNight: nightCount,
                        expiresAtNight: nightCount + 1,
                        duration: 1,
                      },
                    ],
                    statuses: [
                      ...(s.statuses ?? []).filter(
                        (st: any) =>
                          !(
                            st.effect === "Drunk" &&
                            st.duration === "至下个黄昏"
                          )
                      ),
                      { effect: "Drunk", duration: "至下个黄昏" },
                    ],
                    statusDetails: [
                      ...(s.statusDetails || []).filter(
                        (d) => !d.includes("醉酒（至下个黄昏）")
                      ),
                      "醉酒（至下个黄昏）",
                    ],
                  }
                : s
            )
          );
          addLog("🎵 吟游歌手能力触发：夜晚有镇民死亡，爪牙们醉酒直到明天黄昏");
        }
      }

      // 🔧 月之子（Moonchild）夜晚死亡：弹窗让说书人选择诅咒目标
      const moonchildDead = (deadThisNight || []).find((id: number) => {
        const seat = seats.find((s) => s.id === id);
        return seat?.role?.id === "moonchild";
      });
      if (
        moonchildDead !== undefined &&
        currentModal?.type !== "MOONCHILD_KILL"
      ) {
        addLog(
          `${moonchildDead + 1}号（月之子）夜晚死亡，请选择一名存活玩家作为诅咒目标`
        );
        setCurrentModal({
          type: "MOONCHILD_KILL",
          data: { sourceId: moonchildDead, onResolve: () => {} },
        } as any);
        return; // 等待说书人选择目标后再进入黎明报告
      }

      if (
        selectedScript?.id === "bad_moon_rising" &&
        gossipTrueTonight &&
        gossipSourceSeatId !== null
      ) {
        if (currentModal?.type !== "STORYTELLER_SELECT") {
          setCurrentModal({
            type: "STORYTELLER_SELECT",
            data: {
              sourceId: gossipSourceSeatId,
              roleId: "gossip",
              roleName: "造谣者",
              description: "说书人：造谣为真，请选择 1 名玩家死亡。",
              // 🔧 修复：此前缺失 onConfirm，导致选完目标后无人死亡、无法进入黎明报告
              onConfirm: (targetIds: number[]) => {
                const targetId = targetIds[0];
                setCurrentModal(null);
                if (targetId !== undefined) {
                  killPlayer(targetId, {
                    source: "gossip",
                    recordNightDeath: true,
                  });
                  addLog(`🗣 造谣应验：${targetId + 1}号玩家在夜晚死亡`);
                } else {
                  addLog("🗣 造谣为真，但说书人未选择目标（无事发生）");
                }
                // 消费造谣状态，避免重复触发
                setGossipTrueTonight?.(false);
                setGossipSourceSeatId?.(null);
                // 随后进入黎明报告
                setGamePhase("dawnReport");
                const msg =
                  deadThisNight.length > 0
                    ? `昨晚${deadThisNight.map((id: number) => `${id + 1}号`).join("、")}玩家死亡`
                    : "昨天是个平安夜";
                setCurrentModal({
                  type: "NIGHT_DEATH_REPORT",
                  data: { message: msg },
                });
              },
            },
          } as any);
        }
      } else if (currentModal?.type !== "NIGHT_DEATH_REPORT") {
        // 夜晚结束，进入黎明报告阶段
        const msg =
          deadThisNight.length > 0
            ? `昨晚${deadThisNight.map((id) => `${id + 1}号`).join("、")}玩家死亡`
            : "昨天是个平安夜";

        // 直接设置游戏阶段和模态框，避免使用baseDispatch可能导致的冲突
        setGamePhase("dawnReport");
        setCurrentModal({
          type: "NIGHT_DEATH_REPORT",
          data: { message: msg },
        });
      }
    }
  }, [
    currentWakeIndex,
    wakeQueueIds,
    gamePhase,
    deadThisNight,
    gossipTrueTonight,
    gossipSourceSeatId,
    selectedScript,
    currentModal,
    setGamePhase,
    setCurrentModal,
    seats,
    commitSeats,
    addLog,
    nightCount,
  ]);

  const seatContainerRef = useRef<HTMLDivElement>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef<Record<number, HTMLDivElement>>({});

  useEffect(() => {
    if (!mounted) return;
    const checkOrientation = () =>
      setIsPortrait(window.innerHeight > window.innerWidth);
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, [mounted, setIsPortrait]);

  useEffect(() => {
    const all = ["镇民", "外来者", "爪牙", "恶魔"];
    const newly: number[] = [];
    for (const [id, known] of Object.entries(balloonistKnownTypes)) {
      if (
        all.every((l) => known.includes(l)) &&
        !balloonistCompletedIds.includes(Number(id))
      ) {
        newly.push(Number(id));
      }
    }
    if (newly.length > 0) {
      for (const id of newly) {
        addLog(`气球驾驶员${id + 1}号得知所有类型，今后不再被唤醒`);
      }
      setBalloonistCompletedIds((prev: number[]) => [...prev, ...newly]);
    }
  }, [
    balloonistKnownTypes,
    balloonistCompletedIds,
    addLog,
    setBalloonistCompletedIds,
  ]);

  // 初始化座位：当进入setup阶段且座位为空时，根据当前剧本的人数上限创建默认座位
  useEffect(() => {
    if (gamePhase === "setup" && seats.length === 0) {
      const targetCount = selectedScript?.maxPlayers || 15;
      const defaultSeats: Seat[] = Array.from(
        { length: targetCount },
        (_, i) => ({
          id: i,
          playerName: `玩家 ${i + 1}`,
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
          isDemonSuccessor: false,
          hasAbilityEvenDead: false,
          statusDetails: [],
          statuses: [],
          voteCount: 0,
          isCandidate: false,
          grandchildId: null,
          isGrandchild: false,
          isFirstDeathForZombuul: false,
          isZombuulTrulyDead: false,
          zombuulLives: 1,
        })
      );
      commitSeats(defaultSeats);
      setInitialSeats(defaultSeats);
      console.log(
        `DEBUG: 初始化了 ${targetCount} 个默认座位 (剧本: ${selectedScript?.name || "默认"})`
      );
    }
  }, [gamePhase, seats.length, selectedScript, commitSeats, setInitialSeats]);

  // 监听首夜启动事件，触发首夜队列生成并弹出预览模态框
  useEffect(() => {
    const handleStartFirstNight = () => {
      console.log("[GameController] Received startFirstNight event");
      nightLogic.startNight(true);

      // 重要：nightLogic.queue 来自 React state (engineState.queue)，
      // 在 startNight 调用后可能尚未同步。因此直接从 engine 实例读取实时队列。
      // nightLogic.engine 是 NightEngine 实例，其 state getter 返回实时数据。
      const engineState = nightLogic.engine?.state;
      const queue = engineState?.queue || [];
      if (queue.length === 0) {
        console.warn(
          "[GameController] Night queue is empty after startNight (engine state)",
          engineState
        );
        const seatedSeats = seats.filter((s) => !!s.role);
        const hasDemon = seats.some(
          (s) => s.role?.type === "demon" || s.role?.id === "legion"
        );
        if (seatedSeats.length < 5) {
          showAlert(
            `当前仅有 ${seatedSeats.length} 名玩家落座，无法开始首夜。请先在圆桌上为玩家分配角色。`
          );
          return;
        }
        if (!hasDemon) {
          showAlert("当前阵容缺少恶魔角色，无法开始游戏。请至少分配一名恶魔或军团。");
          return;
        }

        // 场上角色齐全但今夜确无行动角色（如军团且罂粟种植者在场，且其他镇民首夜无唤醒能力）
        showAlert("🌙 首夜平安度过：场上所有角色在首夜均无唤醒行动，直接进入第一天。");
        addLog("🌙 首夜平安度过：场上无任何角色需要唤醒行动，直接进入第一天白天。");
        setNightCount(1);
        setGamePhase("day");
        return;
      }

      // 将 NightActionNode[] 转换为 Seat[] 作为 pendingNightQueue
      const pendingSeats: Seat[] = queue
        .map((node: any) => seats.find((s: Seat) => s.id === node.seatId))
        .filter((s: Seat | undefined): s is Seat => !!s);

      if (pendingSeats.length === 0) {
        console.warn(
          "[GameController] No matching seats found for night queue nodes"
        );
        showAlert("夜间节点未匹配到对应座位的角色，请核对座位配置。");
        return;
      }

      // 构建系统步骤映射（minion_info / demon_info -> 队列索引 idx，避免覆盖同座位真实角色的技能）
      const stepMap = new Map<number, string>();
      queue.forEach((node: any, idx: number) => {
        if (
          node.roleId === "minion_info" ||
          node.roleId === "demon_info" ||
          node.roleId === LEGION_MUTUAL_RECOGNITION_ID
        ) {
          stepMap.set(idx, node.roleId);
        }
      });
      if (stepMap.size > 0) {
        systemStepRoleIdsRef.current = stepMap;
        setSystemStepRoleIds(stepMap);
        console.log("[GameController] System info steps by queue index:", [
          ...stepMap.entries(),
        ]);
      } else {
        systemStepRoleIdsRef.current = new Map();
        setSystemStepRoleIds(new Map());
      }

      // 设置 pendingNightQueue
      setPendingNightQueue(pendingSeats);

      // 生成预览数据
      const preview = queue.map((node: any, idx: number) => ({
        roleName: node.roleName || "未知角色",
        seatNo: (node.seatId ?? 0) + 1,
        order: idx + 1,
      }));

      console.log("[GameController] Night order preview:", preview);
      setNightOrderPreview(preview);

      // 弹出预览模态框（但会自动确认，不再需要说书人点击）
      setCurrentModal({
        type: "NIGHT_ORDER_PREVIEW",
        data: {
          preview,
          title: "首夜唤醒顺序预览",
          pendingQueue: pendingSeats,
          autoConfirm: true,
        },
      });
    };
    const listenerId = unifiedEventBus.on(
      "startFirstNight",
      handleStartFirstNight
    );
    return () => {
      unifiedEventBus.off("startFirstNight", listenerId);
    };
  }, [
    nightLogic,
    seats,
    setPendingNightQueue,
    setNightOrderPreview,
    setCurrentModal,
  ]);

  // 监听非首夜启动事件：统一由 startSubsequentNight 重建夜间队列，
  // 确保首夜角色（洗衣妇/厨师/图书管理员等）不会在后续夜被重复唤醒。
  useEffect(() => {
    const handleStartSubsequentNight = () => {
      console.log("[GameController] Received startSubsequentNight event");
      startSubsequentNight();
    };
    const listenerId = unifiedEventBus.on(
      "startSubsequentNight",
      handleStartSubsequentNight
    );
    return () => {
      unifiedEventBus.off("startSubsequentNight", listenerId);
    };
  }, [startSubsequentNight]);

  // 初始化/刷新夜晚步骤信息
  const lastNightRefreshIdxRef = useRef<number | null>(null);
  const lastNightRefreshPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      (gamePhase === "firstNight" || gamePhase === "night") &&
      wakeQueueIds.length > 0 &&
      currentWakeIndex >= 0 &&
      currentWakeIndex < wakeQueueIds.length
    ) {
      // 🔧 修复：首夜第一个角色（小恶魔等）被跳过。
      //   原条件 `!nightInfo` 在 nightInfo 残留时不刷新，导致 index 0 不显示。
      //   刷新条件 = 索引变化 或 阶段变化（进入新夜间）或 nightInfo 为空。
      //   seats 引用变化不应触发重复刷新（避免同一角色反复渲染）。
      const idxChanged = lastNightRefreshIdxRef.current !== currentWakeIndex;
      const phaseChanged = lastNightRefreshPhaseRef.current !== gamePhase;
      if (idxChanged || phaseChanged || !nightInfo) {
        lastNightRefreshIdxRef.current = currentWakeIndex;
        lastNightRefreshPhaseRef.current = gamePhase;
        const currentAuthoritativeSeats =
          seatsRef?.current && seatsRef.current.length > 0
            ? seatsRef.current
            : seats;
        console.log(
          "[GameController] 行动前实时状态检测与信息生成 -> index:",
          currentWakeIndex,
          "phase:",
          gamePhase
        );
        nightSnapshot.updateSnapshot(
          currentWakeIndex,
          currentAuthoritativeSeats,
          gamePhase
        );
      }
    } else {
      lastNightRefreshIdxRef.current = null;
      lastNightRefreshPhaseRef.current = null;
    }
  }, [
    gamePhase,
    wakeQueueIds,
    currentWakeIndex,
    nightInfo,
    seats,
    nightSnapshot,
  ]);

  // 离开夜间阶段时清除 nightInfo（避免 check/day/dusk 残留"行动中"高亮）
  useEffect(() => {
    if (gamePhase !== "firstNight" && gamePhase !== "night") {
      if (nightInfo) {
        console.log("[GameController] 离开夜间阶段，清除 nightInfo");
        setActiveNightStep(null);
      }
    }
  }, [gamePhase, nightInfo, setActiveNightStep]);

  // 安全网：夜间阶段nightInfo为空且队列未耗尽时，自动推进
  useEffect(() => {
    if (gamePhase !== "firstNight" && gamePhase !== "night") return;
    const queueLen = wakeQueueIds?.length || 0;
    if (currentWakeIndex >= queueLen) return;
    if (wakeIndexRef.current >= queueLen) return;
    if (nightInfo === null && !currentModal) {
      // 🔧 修复：首夜 index 0（第一个角色，如小恶魔）尚未显示时，
      //   只刷新显示、不自动推进。否则安全网会在 updateSnapshot(0)
      //   的 state 生效前抢先执行，把 index 从 0 推到 1，导致小恶魔被跳过。
      if (currentWakeIndex === 0 && wakeIndexRef.current === 0) {
        if (!hasShownIndexZeroRef.current) {
          console.log(
            "[GameController] 首夜 index 0 未显示，刷新显示第一个角色"
          );
          nightSnapshot.updateSnapshot(0, seats, gamePhase);
        }
        return;
      }
      console.log("[GameController] 安全网：nightInfo为空，自动推进到下一步");
      continueToNextAction();
    }
  }, [
    gamePhase,
    currentWakeIndex,
    wakeQueueIds,
    nightInfo,
    currentModal,
    continueToNextAction,
    wakeIndexRef,
    hasShownIndexZeroRef,
    nightSnapshot,
    seats,
  ]);

  // 动态预测与实时渲染当前或即将到来的夜晚行动顺序，保证恶魔与所有在场角色的行动位始终精准且实时同步
  const liveNightOrderPreview = useMemo(() => {
    // 1. 如果处于夜间阶段且引擎已有实时队列，使用实时运行队列
    const engineState = nightLogic.engine?.state;
    const liveQueue = engineState?.queue;
    if (
      (gamePhase === "firstNight" || gamePhase === "night") &&
      Array.isArray(liveQueue) &&
      liveQueue.length > 0
    ) {
      return liveQueue.map((node: any, idx: number) => ({
        roleName: node.roleName || "未知角色",
        seatNo: (node.seatId ?? 0) + 1,
        order: idx + 1,
      }));
    }

    // 2. 否则根据当前游戏阶段与在场座位实时预测计算对应夜晚的唤醒顺序
    const isFirstNight =
      gamePhase === "firstNight" || (gamePhase === "setup" && nightCount <= 1);
    const snapNightCount = isFirstNight
      ? 1
      : Math.max(
          2,
          nightCount + (gamePhase === "dusk" || gamePhase === "day" ? 1 : 0)
        );
    const snapshot = {
      nightCount: snapNightCount,
      hasCompletedFirstNight: !isFirstNight,
      seats: seats.map((s) => ({
        id: s.id,
        role: s.role,
        charadeRole: s.charadeRole,
        isAlive: !s.isDead,
        isDead: !!s.isDead,
        isDemonSuccessor: s.isDemonSuccessor,
      })),
      statusEffects: {},
      gamePhase: isFirstNight ? ("firstNight" as const) : ("night" as const),
      deadThisNight: [...(gameState.deadThisNight || [])],
      todayExecutedId: gameState.todayExecutedId ?? null,
    };

    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      snapshot as any,
      { isFirstNight }
    );

    return queue.map((node, idx) => ({
      roleName: node.roleName || "未知角色",
      seatNo: (node.seatId ?? 0) + 1,
      order: idx + 1,
    }));
  }, [
    gamePhase,
    nightCount,
    seats,
    nightLogic.engine?.state,
    gameState.deadThisNight,
    gameState.todayExecutedId,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 汇总对象按需透传，全量依赖会造成全页重渲染
  return useMemo(
    () => ({
      ...gameState,
      addLog,
      updateSnapshot: nightSnapshot.updateSnapshot,
      refreshSnapshot: nightSnapshot.refreshSnapshot,
      logicDispatch,
      checkGameOver,
      currentNightRole: nightInfo?.effectiveRole?.name,
      nextNightRole: (nightInfo as any)?.nextRoleName,
      nightOrderPreviewLive:
        liveNightOrderPreview.length > 0
          ? liveNightOrderPreview
          : gameState.nightOrderPreview || [],
      nightInfo,
      getDemonDisplayName,
      killPlayer,
      nightLogic,
      changeRole,
      swapRoles,
      swapSeats,
      handlePreStartNight,
      handleStartNight,
      startSubsequentNight,
      handleDrunkCharadeSelect,
      proceedToCheckPhase,
      reviveSeat,
      convertPlayerToEvil,
      insertIntoWakeQueueAfterCurrent,
      executePlayer,
      confirmKill,
      submitVotes,
      executeJudgment,
      confirmPoison,
      confirmPoisonEvil,
      confirmExecutionResult,
      enterDuskPhase,
      resolveLunaticRps,
      confirmShootResult,
      handleSlayerTargetSelect,
      confirmMayorRedirect,
      confirmHadesiaKill,
      confirmMoonchildKill,
      confirmSweetheartDrunk,
      confirmKlutzChoice,
      confirmStorytellerDeath,
      confirmHadesia,
      confirmSaintExecution,
      cancelSaintExecution,
      confirmRavenkeeperFake,
      confirmVirginTrigger,
      confirmRestart,
      executeNomination,
      cancelNomination,
      handleDayAction,
      handleVirginGuideConfirm,
      handleDayAbilityTrigger,
      handleDayAbility,
      handleContinueGame,
      registerVotes,
      confirmNightDeathReport,
      victorySnapshot,
      // 🔧 造谣者（Gossip）白天声明所需的 setter（此前缺失导致声明状态永远无法设置）
      setGossipTrueTonight,
      setGossipSourceSeatId,
      setGossipStatementToday,
      handleRestart: () =>
        setCurrentModal({ type: "RESTART_CONFIRM", data: null }),
      handleSwitchScript,
      handleNewGame,
      handleStepBack: wrappedHandleStepBack,
      handleGlobalUndo,
      closeNightOrderPreview,
      confirmNightOrderPreview: () => {
        // 首先调用原始的confirmNightOrderPreview函数
        confirmNightOrderPreview();

        // 然后调用nightLogic.finalizeNightStart来开始夜晚
        // 注意：我们需要从pendingNightQueue中获取队列
        if (
          gameState.pendingNightQueue &&
          gameState.pendingNightQueue.length > 0
        ) {
          console.log(
            "[GameController] Calling finalizeNightStart with pending queue"
          );
          nightLogic.finalizeNightStart(gameState.pendingNightQueue, true);
          // 🔧 修复：立即刷新第一个夜间角色（index 0），否则小恶魔等
          //   首夜第一个角色被跳过（continueToNextAction 会从 0 推到 1）。
          //   confirmNightOrderPreview 设置 wakeQueueIds 后，这里显式显示 index 0。
          setTimeout(() => {
            try {
              nightSnapshot.updateSnapshot(0, seats, "firstNight");
            } catch (e) {
              console.warn("[GameController] 首夜 index0 刷新失败", e);
            }
          }, 50);
        } else {
          console.warn(
            "[GameController] No pendingNightQueue found, cannot start night"
          );
        }
      },
      proceedToFirstNight,
      onSeatClick,
      toggleStatus: interactionToggleStatus,
      handleMenuAction,
      handleConfirmAction: interactionHandleConfirmAction,
      toggleTarget: interactionToggleTarget,
      handleDayEndTransition,
      getSeatRoleId,
      formatTimer,
      getDisplayRoleType,
      setHadesiaChoice: (id: number, c: "live" | "die") =>
        setHadesiaChoices((prev: any) => ({ ...prev, [id]: c })),
      setRedNemesisTarget: (tid: number) =>
        commitSeats((prev) =>
          prev.map((s) => ({
            ...s,
            isRedHerring: s.id === tid,
            isFortuneTellerRedHerring: s.id === tid,
            statusDetails:
              s.id === tid
                ? [...(s.statusDetails || []), "天敌红罗剎"]
                : (s.statusDetails || []).filter((d) => d !== "天敌红罗剎"),
          }))
        ),
      handleTimerPause,
      handleTimerStart,
      handleTimerReset,
      isTimerRunning,
      isTargetDisabled,
      groupedRoles,
      isGoodAlignment,
      getSeatPosition,
      hasUsedAbility,
      hasUsedDailyAbility,
      isActionAbility,
      isActorDisabledByPoisonOrDrunk,
      addLogWithDeduplication,
      continueToNextAction,
      saveHistory,
      enterDayPhase,
      loadGameRecords,
      saveGameRecord,
      cleanStatusesForNewDay,
      enqueueRavenkeeperIfNeeded,
      resetRegistrationCache,
      getRegistrationCached,
      getFilteredRoles,
      markAbilityUsed,
      markDailyAbilityUsed,
      getDisplayRoleForSeat,
      filteredGroupedRoles,
      seatContainerRef,
      consoleContentRef,
      currentActionTextRef,
      seatRefs,
      declareMayorImmediateWin,
      cleanseSeatStatuses,
      ...setupManager,
    }),
    [
      gameState,
      addLog,
      logicDispatch,
      nightInfo,
      getDemonDisplayName,
      killPlayer,
      nightLogic,
      onSeatClick,
      interactionToggleStatus,
      handleMenuAction,
      interactionToggleTarget,
      isTargetDisabled,
      interactionHandleConfirmAction,
      continueToNextAction,
      saveHistory,
      enterDayPhase,
      loadGameRecords,
      saveGameRecord,
      cleanStatusesForNewDay,
      enqueueRavenkeeperIfNeeded,
      resetRegistrationCache,
      getRegistrationCached,
      getFilteredRoles,
      markAbilityUsed,
      markDailyAbilityUsed,
      getDisplayRoleForSeat,
      filteredGroupedRoles,
      hasUsedAbility,
      hasUsedDailyAbility,
      addLogWithDeduplication,
      setupManager,
      cancelSaintExecution,
      changeRole,
      checkGameOver,
      closeNightOrderPreview,
      confirmExecutionResult,
      confirmHadesia,
      confirmHadesiaKill,
      confirmKill,
      confirmKlutzChoice,
      confirmMayorRedirect,
      confirmMoonchildKill,
      confirmNightDeathReport,
      confirmNightOrderPreview,
      confirmPoison,
      confirmPoisonEvil,
      confirmRavenkeeperFake,
      confirmRestart,
      confirmSaintExecution,
      confirmShootResult,
      confirmStorytellerDeath,
      confirmSweetheartDrunk,
      confirmVirginTrigger,
      convertPlayerToEvil,
      declareMayorImmediateWin,
      enterDuskPhase,
      executeJudgment,
      executeNomination,
      cancelNomination,
      executePlayer,
      formatTimer,
      getDisplayRoleType,
      getSeatRoleId,
      handleDayAbility,
      handleViewDayAbilityResult,
      handleContinueGame,
      handleDayAbilityTrigger,
      handleDayAction,
      handleDayEndTransition,
      handleDrunkCharadeSelect,
      handleGlobalUndo,
      handleNewGame,
      handlePreStartNight,
      handleSlayerTargetSelect,
      handleStartNight,
      startSubsequentNight,
      wrappedHandleStepBack,
      handleSwitchScript,
      handleTimerPause,
      handleTimerReset,
      handleTimerStart,
      handleVirginGuideConfirm,
      insertIntoWakeQueueAfterCurrent,
      isTimerRunning,
      proceedToCheckPhase,
      proceedToFirstNight,
      registerVotes,
      resolveLunaticRps,
      reviveSeat,
      setCurrentModal,
      setHadesiaChoices,
      commitSeats,
      submitVotes,
      swapRoles,
      swapSeats,
      victorySnapshot,
      nightSnapshot,
    ]
  );
}
