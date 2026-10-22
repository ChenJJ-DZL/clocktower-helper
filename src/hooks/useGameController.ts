/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { resolveMinstrelIntoxication } from "../utils/minstrelRule";
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
import { getAllRoleDefinitions, getRoleDefinition } from "../roles";
import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import type { GameRecord } from "../types/game";
import { executeNightAbility } from "../utils/abilityExecutor";
import { canFoolSurvive, isProtectedByDevilsAdvocate } from "../utils/bmrMechanics";
import { isVortoxDuskWinActive } from "../utils/vortoxWorld";
import {
  generateDynamicNightQueue,
  isDeathTriggeredRole,
  roleHasNightAction,
  seatHasNightAction,
} from "../utils/dynamicQueueGenerator";
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
import { showAlert } from "../utils/nativeDialogShim";
import {
  createSnapshotFromState,
  saveCurrentSnapshot,
} from "../utils/persistence";
import { checkAndUpdatePixieAbility } from "../utils/pixieHelper";
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
    twilightVoteTargets,
    travelerHookChoices,
    travelers,
    activeFabled,
    travelerAlignments,
    setTwilightVoteTarget,
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
    gossipStatementToday,
    gossipTrueTonight,
    gossipSourceSeatId,
    setGossipTrueTonight,
    setGossipSourceSeatId,
    setGossipStatementToday,
    evilTwinPair,
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

  /**
   * 🔴 2026-09-22 新增：**能力击杀后的终局判定入口**。
   *
   * 背景（真实缺陷，E2E 实测抓到）：
   *   `killPlayer` 只改座位状态，**从不**判终局；而终局判定在各**调用方**手里
   *   （`checkGameOver`，由 `useLogicDispatcher` 提供）。夜间路径与处决路径都各自补了，
   *   但**白天能力击杀路径漏了** —— 例如「女巫诅咒杀死提名者」
   *   （`useDayActions.ts` 里 `killPlayer(sourceId, { skipGameOverCheck: false })`
   *   之后直接 `return`，没有任何终局判定）。
   *   ⇒ 若被诅咒的提名者**就是恶魔**，则「恶魔死了却继续进下一夜」，违反官方
   *     「**Good wins if the Demon dies**」。
   *
   * ⚠️ 为什么用 ref 而不是直接调 `checkGameOver`：
   *   `checkGameOver` 由 `useLogicDispatcher` 返回，而它的调用位置在本文件**更靠后**
   *   （`killPlayer` 定义在前）⇒ 定义期引用会踩 TDZ。用 ref 在渲染期回填
   *   （与上面 `seatsRef.current = seats` 同一套路），调用期已是可用函数。
   *
   * ⚠️ `killPlayer` 与 `useLogicDispatcher` **走的是同一条写入路径**
   *   （`useLogicDispatcher(seats, commitSeats, …)` 把 `commitSeats` 当 `setSeats` 用）
   *   ⇒ 不存在「双写入点分叉」，只是**调用方漏调**。
   */
  const gameOverRef = useRef<{ run: (s: Seat[]) => void }>({ run: () => {} });

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
  /**
   * 当前剧本的「外来者池」大小——用于配比修正的钳制上限。
   * 例：无名之墓只有 3 个外来者，男爵想 +2 也加不满 ⇒ 期望值必须是 8/3 而不是 7/4。
   *
   * 🔴 2026-10-21 修复（S14 卡死根因）：
   *   这里原来用 `getAllRoleDefinitions()`（**新引擎注册表**）统计外来者。
   *   但该注册表**缺 `scapegoat`**（替罪羊只有 app/data 的数据条目 + ability
   *   文件，没进 roleRegistry）⇒ 无名之墓被算成「外来者池 = 2」。
   *   后果：15 人男爵局 —— 发牌器按池 3 发成 8镇民/3外来者（合法），
   *   而 setup 校验按池 2 期望 9镇民/2外来者 ⇒ 弹「⚠️ 阵容配置错误」
   *   ⇒「确认无误…入夜」永不出现，整场 E2E 卡在分发之后。
   *   修法：**与 setup UI 用同一张表**（`app/data.ts::roles`），
   *   引擎注册表只作兜底（同 id 在 app/data 里查不到时才看它）。
   */
  const availableOutsiderPool = useMemo(() => {
    const ids = (selectedScript as any)?.roleIds as string[] | undefined;
    if (!Array.isArray(ids) || ids.length === 0) return undefined;
    const wanted = new Set(ids);
    const fromData = new Set(
      roles.filter((r) => wanted.has(r.id) && r.type === "outsider").map((r) => r.id)
    );
    for (const def of getAllRoleDefinitions() as any[]) {
      if (wanted.has(def.id) && def.type === "outsider") fromData.add(def.id);
    }
    return fromData.size;
  }, [selectedScript]);

  const setupManager = useSetupManager(seats, commitSeats, availableOutsiderPool);

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
    (msgOrEntry: string | { message: string; summary?: string }) => {
      const entry =
        typeof msgOrEntry === "string"
          ? { message: msgOrEntry }
          : msgOrEntry;
      logSeqRef.current += 1;
      village.setGameLogs((p) => [
        ...(p as any),
        {
          day: gamePhase === "setup" ? 0 : nightCount,
          phase: gamePhase,
          message: entry.message,
          summary: entry.summary,
          ts: Date.now(),
          seq: logSeqRef.current,
        },
      ]);
    },
    [village, nightCount, gamePhase]
  );

  const addLogWithDeduplication = useCallback(
    (
      msgOrEntry: string | { message: string; summary?: string },
      playerId?: number,
      roleName?: string
    ) => {
      const entry =
        typeof msgOrEntry === "string"
          ? { message: msgOrEntry }
          : msgOrEntry;
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
            message: entry.message,
            summary: entry.summary,
            ts: Date.now(),
            seq: logSeqRef.current,
          },
        ];
      });
    },
    [village, nightCount, gamePhase]
  );

  const insertIntoWakeQueueAfterCurrent = useCallback(
    (
      id: number,
      opts?: {
        roleOverride?: Role | null;
        logLabel?: string;
        /**
         * ⭐ 2026-09-21（洗脑师告知流程，用户实测报告「被洗脑者不会被唤醒」）：
         * 跳过「有无夜间行动」准入检查。
         *
         * 该检查的存在意义是**防止纯被动角色（如罂粟种植者）被误唤醒**并弹出
         * 「N号-角色名 - 结果」空壳信息窗。但「被洗脑告知」是**说书人主动发起的
         * 系统通知步骤**，被通知者（可能是毫无夜间技能的镇民）**必须**被唤醒 ——
         * 官方规则要求他当场知道「你需要疯狂证明自己是【X】」。
         * ⇒ 这类调用方显式传 `force: true`，责任自负。
         */
        force?: boolean;
        /**
         * ⭐ 2026-09-24（用户要求「参考镜像双子的流程，洗脑后**立即**增加唤醒环节」）：
         * 插入位置。
         *   · `"priority"`（默认，既有行为）：按 `firstNightOrder/otherNightOrder`
         *     插入到剩余队列的**正确夜序位置**，无夜序者落到队尾。
         *   · `"next"`：**紧跟当前步骤之后**（`currentWakeIndex + 1`）。
         *
         * 用于「说书人主动发起的即时告知步骤」——官方要求洗脑师选完人**当场**唤醒
         * 被洗脑者告知，而不是等到队尾。镜像双子的告知节点也是紧随其后的
         * （`dynamicQueueGenerator` 第 6 步：`evilTwinIdx + 1`）。
         *
         * ⚠️ 仍然受 `prev.includes(id)` 去重保护 ⇒ 已在队列中的座位不会被重复唤醒、
         *    更不会被提前（他自己的技能步骤照旧）。
         */
        position?: "next" | "priority";
        /**
         * ⭐ 2026-09-24（洗脑师告知）：把本节点登记为**系统步骤**。
         *
         * 队列只存座位 id，`systemStepRoleIds`（key = **队列 index**，
         * 见 `useNightSnapshot::updateSnapshot`）里没有新节点 ⇒ 下游适配器会按
         * 该座位的**真实角色**解析 —— 有夜间技能的座位会再弹一次技能页、
         * 永远收不到告知。登记后适配器按该系统步骤 id 走专属分支。
         */
        stepOverride?: string;
        /**
         * ⭐ 2026-09-24（洗脑师告知）：允许**重插已处理过**的座位。
         * 洗脑师夜序晚于多数镇民 ⇒ 目标往往已经行动过（在 processed 段）；
         * 默认的 `prev.includes(id)` 全局去重会拒绝入队 ⇒ 告知丢失。
         * 开启后：目标仍在**剩余队列**里 ⇒ 照旧去重（他会在自己的步骤里被告知）；
         * 已处理/不在队列 ⇒ 允许作为独立告知节点重插。
         */
        reinsertIfProcessed?: boolean;
      }
    ) => {
      // 🌺 队列准入不变式：没有夜间行动的角色（纯被动，如罂粟种植者）永远不得入队。
      //    `nightInfoGenerator` 对"无 night 配置"的角色有合成文案兜底
      //    （「唤醒N号【角色名】，准备执行技能。」，全库 50+ 角色命中，不能删），
      //    一旦纯被动角色被塞进 wakeQueueIds，就会被"唤醒"并弹出
      //    「N号-角色名 - 结果」信息窗 —— 这正是罂粟种植者被动技能被误唤醒的成因。
      //    本入口只按座位 id 插入、无反向校验，故必须在此兜住。
      const seatForCheck = seats.find((s) => s.id === id);
      // 有 roleOverride 时以 override 为准（如假死转生 / 伪装能力），
      // 否则用座位版本（酒鬼 / 提线木偶会按其伪装身份判断）。
      const allowed =
        opts?.force === true
          ? true
          : opts?.roleOverride?.id
            ? roleHasNightAction(opts.roleOverride.id)
            : seatHasNightAction(seatForCheck);
      if (!allowed) {
        console.log(
          `[insertIntoWakeQueueAfterCurrent] ⛔ 拒绝入队：${
            opts?.roleOverride?.id ?? seatForCheck?.role?.id ?? "未知"
          } 无夜间行动（纯被动角色）`
        );
        return;
      }
      // ⭐ position:"next"（2026-09-24 洗脑师告知）：**紧跟当前步骤**插入。
      //    基于 `wakeQueueIdsRef`（最新队列）同步计算，直接写 ref + setState ——
      //    不走 setState updater（纯函数约束：updater 里做 map 修正这类副作用
      //    在 StrictMode 下会被双调用执行两次 ⇒ shift 两次 = 错位）。
      if (opts?.position === "next") {
        const prev = wakeQueueIdsRef.current ?? [];
        const rest = prev.slice(currentWakeIndex + 1);
        // 去重：目标仍在剩余队列 ⇒ 照旧去重（他会在自己的步骤里被告知）；
        // 已处理/不在队列 + reinsertIfProcessed ⇒ 允许作为独立告知节点重插。
        if (
          prev.includes(id) &&
          !(opts?.reinsertIfProcessed === true && !rest.includes(id))
        ) {
          return;
        }
        const insertPos = currentWakeIndex + 1;
        const next = [
          ...prev.slice(0, insertPos),
          id,
          ...prev.slice(insertPos),
        ];
        wakeQueueIdsRef.current = next;
        setWakeQueueIds(next);
        // 🧠 systemStepRoleIds 同步：key = 队列 index ⇒ 插入点之后的既有映射
        //    整体右移一位，再登记本节点的系统步骤 id。**不修正的话，插入点之后
        //    的系统步骤（minion_info/demon_info/双子告知…）会串到错误的节点上**。
        if (opts?.stepOverride || systemStepRoleIdsRef.current.size > 0) {
          const shifted = new Map<number, string>();
          systemStepRoleIdsRef.current.forEach((roleId, idx) => {
            shifted.set(idx >= insertPos ? idx + 1 : idx, roleId);
          });
          if (opts?.stepOverride) {
            shifted.set(insertPos, opts.stepOverride);
          }
          systemStepRoleIdsRef.current = shifted;
          setSystemStepRoleIds?.(shifted);
        }
        if (opts?.logLabel) addLog(`${opts.logLabel} 已加入本夜唤醒队列`);
        return;
      }
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
    [
      gamePhase,
      currentWakeIndex,
      seats,
      setWakeQueueIds,
      addLog,
      wakeQueueIdsRef,
      systemStepRoleIdsRef,
      setSystemStepRoleIds,
    ]
  );

  /**
   * 🌙 **本夜已因自身能力被唤醒过的座位**（跨角色累积，跨夜晚清空）。
   *
   * 为什么需要：侍女的「你们中有几人当晚因其自身能力被唤醒」要读
   * `snapshot.wokenPlayerIds`，而夜间管道的快照是**每次行动现构**的
   * ⇒ 不动用外部容器的话，后行动的角色看不到前面谁被叫过（实测恒报 0）。
   * 与「一状态一镜像」同源：这份集合只允许一个 owner（本 ref），
   * `useNightActionHandler` 只读不写（除把自己加进来）。
   */
  const wokenThisNightRef = useRef<Set<number>>(new Set());

  const killPlayer = useCallback(
    (targetId: number, options: any = {}) => {
      const {
        source = "ability",
        recordNightDeath = true,
        onAfterKill,
        /**
         * 🔴 2026-09-22：该字段此前是**死字段**（全仓 6 处传入、`killPlayer` 从不消费）。
         * 现已按它**本来的语义**落地：
         *   · 默认 `false` ⇒ **每次击杀后都判终局**（官方「恶魔死亡 ⇒ 善良胜」是通用规则）
         *   · 传 `true` ⇒ 跳过（多目标击杀的中间步骤用，避免 N 次重复判定）
         * 幂等保护：`gameOverRef.run` 内部先看 `victoryRef.current`，已终局就不再判。
         */
        skipGameOverCheck = false,
      } = options;

      /**
       * 🃏 **弄臣首次免死 —— 不分死因**（2026-09-22 修复）
       * ==================================================================
       * 官方【弄臣】：「**当你首次将要死亡时，你不会死亡。**」—— 措辞是**通用**的，
       *   对恶魔击杀 / 处决 / 其他能力击杀**一律适用**。
       *
       * 🔴 修复的缺陷：`isImmuneToDemonKill`（内含 fool 分支）**只被恶魔能力消费**，
       *   而 `useExecutionHandlers` 全文**搜不到 `fool`** ⇒ **处决一个尚未使用免死的弄臣
       *   会直接死亡**。`killPlayer` 是「处决 + 能力击杀」的唯一咽喉 ⇒ 在此补齐。
       *
       * ⚠️⚠️ **必须在这里（`commitSeats` 之前）提前 `return`** —— 这是本修复的关键，
       *   踩过的坑记下来：`commitSeats(...)` 之后还有**两条无条件**副作用
       *     `setDeadThisNight(...)` 与 `setOutsiderDiedToday(true)`（弄臣是**外来者**）
       *   ⇒ 若只在 `commitSeats` 的 updater 里「让他不死」，就会出现
       *     「**人还活着，却被记成今夜死者 + 今日有外来者死亡**」的**更严重**不一致
       *     （连带影响夜报 / 送葬者 / **教父的「今日有外来者死亡」额外杀人前置**）。
       *
       * ✅ 与夜杀路径**互不冲突**：恶魔夜杀已被 `isImmuneToDemonKill` 提前拦下、
       *   不走 `killPlayer`；那条路径的「消费」由管道后置中间件
       *   `createFoolImmunityConsumer` 负责（两者判据同源 `canFoolSurvive` ⇒ 幂等）。
       */
      /**
       * 🤪 呆瓜（Klutz）：死亡后必须公开选择一名存活玩家。
       *
       * 🔴 2026-10-21 修复死路径：`KLUTZ_CHOICE` 弹窗此前**全仓没有触发点**
       *   （`KlutzChoiceModal` / `confirmKlutzChoice` / `types/modal.ts` 三处齐全，
       *   但搜遍 `src/` 没有任何 `setCurrentModal({type:"KLUTZ_CHOICE"})`）
       *   ⇒ 呆瓜的核心能力在生产里**永远不会发生**。
       *
       * 这里在死亡**之前**捕获身份（提交后 `isDead` 已变），死亡落库后再开弹窗；
       * 用函数式更新读 `prev`，避免覆盖已经弹出的 `GAME_OVER`（处决恶魔致死等）。
       */
      const klutzBeforeDeath = seatsRef.current.find((s) => s.id === targetId);
      const klutzWillResolve =
        klutzBeforeDeath?.isDead !== true &&
        ((klutzBeforeDeath as any)?.charadeRole?.id === "klutz" ||
          klutzBeforeDeath?.role?.id === "klutz");

      /**
       * 🔴 2026-10-21：处决来源要**忽略「刚被 EXECUTE_PLAYER 标死」**这一事实。
       *
       * `useExecutionHandlers::executePlayer` 的 legacy 分支先 dispatch
       * `EXECUTE_PLAYER`（reducer 里 `target.isDead = true`），再调本函数；
       * 若这里按 `isAliveSeat` 判，弄臣永远救不回来（无名之墓 S15 实测：
       * 处决弄臣 `dead=[8]`，`foolUsed` 仍为 undefined）。
       */
      const foolProbe = seatsRef.current.find((s) => s.id === targetId);
      if (
        canFoolSurvive(foolProbe, { ignoreAlive: source === "execution" })
      ) {
        addLog(
          `🃏 ${targetId + 1}号(弄臣) 首次面临死亡，免死能力生效 —— 他不会死亡`
        );
        commitSeats((prev) =>
          prev.map((s) =>
            s.id === targetId
              ? {
                  ...s,
                  isDead: false,
                  foolUsed: true,
                  hasUsedFoolAbility: true,
                }
              : s
          )
        );
        // 流程仍需继续（调用方靠 onAfterKill 推进）；但**不**记夜死、**不**记外来者死亡、**不**判终局
        if (onAfterKill) onAfterKill();
        return;
      }

      /**
       * 😈 **魔鬼代言人：处决豁免（2026-10-22 修复）**
       * ==================================================================
       * 官方【魔鬼代言人】：「每个夜晚，你要选择一名存活的玩家（与上个夜晚不同）：
       *   **如果明天白天他被处决，他不会死亡。**」
       *
       * 🔴 修复的缺陷：`devils_advocate.ability.ts::stateUpdate` 一直**写**着
       *   `isExecutionProtected: true` + `statusEffects[{type:"execution_protected"}]`，
       *   而 `bmrMechanics::isProtectedByDevilsAdvocate` 也一早写好了判据 ——
       *   但**全仓库没有任何生产代码调用它**（`grep -rn isProtectedByDevilsAdvocate src/ app/`
       *   只命中定义与 `__tests__`）⇒ 保护标记写了没人读 ⇒ 保护对象照样被处决死。
       *   实测：窃窃私语 S13 第 1 夜保护 2 号，第 1 昼处决 2 号 ⇒ `isDead=true`。
       *
       * ⚠️ 与弄臣分支同构，且必须做两件事：
       *   ① `isDead: false` —— 处决主链的 legacy 分支**先** dispatch `EXECUTE_PLAYER`
       *      把目标标死，再调本函数，所以这里必须把「刚被标死」回滚；
       *   ② **消费掉标记**（`isExecutionProtected: false` + 清 statusEffects 里的
       *      `devils_advocate` 项）—— 保护只挡「明天那一次处决」，不能永久生效。
       *   只在 `source === "execution"` 生效：夜杀不走这条豁免（官方只管处决）。
       */
      const daProbe = seatsRef.current.find((s) => s.id === targetId);
      if (source === "execution" && isProtectedByDevilsAdvocate(daProbe)) {
        addLog(
          `😈 ${targetId + 1}号 受魔鬼代言人保护 —— 本次处决不会死亡`
        );
        commitSeats((prev) =>
          prev.map((s) =>
            s.id === targetId
              ? {
                  ...s,
                  isDead: false,
                  isExecutionProtected: false,
                  statusEffects: (s.statusEffects ?? []).filter(
                    (e: any) => e?.source !== "devils_advocate"
                  ),
                }
              : s
          )
        );
        if (onAfterKill) onAfterKill();
        return;
      }

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

        /**
         * 🎵 吟游诗人：**爪牙死于处决** ⇒ 除吟游诗人与旅行者外的**所有人**醉酒
         * 直到明天黄昏。
         *
         * ⚠️ 必须放在这里（死亡已落库之后、返回之前）：
         *   · 判据要读「被处决者是否真的死了」⇒ 弄臣/士兵/魔鬼代言人保护下不死时
         *     官方明确不触发，`isDead !== true` 天然掐掉；
         *   · `source === "execution"` 才进（夜间死亡不触发，官方明确）。
         * 判据唯一入口：`utils/minstrelRule::resolveMinstrelIntoxication`。
         */
        if (source === "execution") {
          const minstrelHit = resolveMinstrelIntoxication(
            updatedSeats as any,
            targetId,
            "execution"
          );
          if (minstrelHit.triggered) {
            const drunkIds = new Set(minstrelHit.intoxicatedSeatIds);
            updatedSeats = updatedSeats.map((s) =>
              drunkIds.has(s.id)
                ? {
                    ...s,
                    isDrunk: true,
                    statusEffects: [
                      ...(s.statusEffects ?? []).filter(
                        (e: any) => !(e.type === "drunk" && e.source === "minstrel")
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
                      ...((s as any).statuses ?? []).filter(
                        (st: any) =>
                          !(st.effect === "Drunk" && st.duration === "至下个黄昏")
                      ),
                      { effect: "Drunk", duration: "至下个黄昏" },
                    ],
                    statusDetails: [
                      ...(s.statusDetails || []).filter(
                        (d: string) => !d.includes("醉酒（至下个黄昏）")
                      ),
                      "醉酒（至下个黄昏）",
                    ],
                  }
                : s
            );
            addLog(
              `🎵 吟游诗人能力触发：${targetId + 1}号（爪牙）被处决致死，除吟游诗人与旅行者外全体醉酒直到明天黄昏（${minstrelHit.intoxicatedSeatIds.length} 人）`
            );
          }
        }

        // 🧚 小精灵能力激活检测：如果死者中有小精灵临摹的镇民，小精灵获得其能力
        updatedSeats = checkAndUpdatePixieAbility(updatedSeats, addLog);

        return updatedSeats;
      });

      if (recordNightDeath)
        setDeadThisNight((prev: number[]) =>
          prev.includes(targetId) ? prev : [...prev, targetId]
        );
      if (getSeatRoleId(targetId) === "outsider") setOutsiderDiedToday(true);
      /**
       * 🔴 先判终局、再跑 `onAfterKill`：
       *   放在 `onAfterKill` **之前**，是为了让调用方自己的 `checkGameOver(...)`
       *   （如小恶魔传位要带 `executedPlayerId`）最终**覆盖**这里的通用判定。
       */
      if (!skipGameOverCheck) gameOverRef.current.run(seatsRef.current);

      // 🤪 呆瓜死亡 ⇒ 打开「公开选择一名存活玩家」弹窗（官方：死亡后立即选）
      if (klutzWillResolve) {
        addLog(`🤪 ${targetId + 1}号(呆瓜) 死亡，必须公开选择一名存活玩家`);
        setCurrentModal((prev: any) =>
          prev?.type === "GAME_OVER"
            ? prev
            : { type: "KLUTZ_CHOICE", data: { sourceId: targetId } }
        );
      }

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
      setCurrentModal,
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
        // 📋 恢复操作记录（2026-09-24 用户实测「继续对局后复盘没有信息」：
        //   恢复此前不含 gameLogs ⇒ 座位/阶段都在而日志全丢）。旧档无此字段 ⇒ 空数组。
        gameLogs: (snap as any).gameLogs ?? [],
        // ⭐ 恢复传奇角色 / 旅行者座位（随快照持久化，刷新/继续对局不得丢选择）
        activeFabled: (snap as any).activeFabled ?? [],
        travelers:
          Array.isArray((snap as any).travelers) &&
          (snap as any).travelers.length === 4
            ? (snap as any).travelers
            : Array.from({ length: 4 }, () => null),
        // 🔴 2026-10-16 修复：以下字段是**独立 state**（不存在于 seats 里），
        //    restore 的显式白名单此前漏掉它们 ⇒「继续对局」后表现为：
        //      · 暮色步骤回到第 1 步、官员/窃贼当晚选的加成目标蒸发；
        //      · 替罪羊/枪手的说书人裁决与频次闩锁丢失（同一天可再射一次）；
        //      · **旅行者阵营全部回到默认善良**（邪恶替罪羊代刑永久失效）；
        //      · 乞丐收到的投票标记清零（"又能无限投票了"）。
        twilightStepIndex: (snap as any).twilightStepIndex ?? 0,
        twilightVoteTargets: (snap as any).twilightVoteTargets ?? {
          bureaucratTargetId: null,
          thiefTargetId: null,
        },
        travelerHookChoices: (snap as any).travelerHookChoices ?? {
          scapegoatSubstituteForId: null,
          gunslingerEligibleVoterIds: [],
          gunslingerTargetId: null,
          gunslingerWindowNight: null,
          gunslingerUsedNight: null,
          judgeUsedThisGame: false,
          butcherExtraExecutionDay: null,
          boneCollectorUsed: false,
          boneCollectorTargetId: null,
          baristaTargetId: null,
          baristaEffect: null,
          harlotTargetId: null,
          harlotAgreed: false,
          harlotDoomed: false,
          apprenticeGrantedRoleId: null,
          matronSwaps: [],
        },
        fabledState: (snap as any).fabledState ?? {
          fibbinUsed: false,
          fibbinTargetId: null,
          angelProtectedSeatId: null,
          angelPunishedSeatId: null,
          revolutionaryPair: null,
          revolutionaryDisguiseUsed: false,
          sentinelOutsiderDelta: 0,
          spiritOfIvoryCapped: false,
          ferrymanLastDayResolved: false,
          toymakerAttackSkipped: false,
        },
        travelerAlignments: (snap as any).travelerAlignments ?? {},
        beggarState: (snap as any).beggarState ?? {
          tokens: 0,
          donations: [],
        },
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
      setVictorySnapshot,
      evilTwinPair,
      // ⭐ 剧本级特殊规则所需输入（见 utils/scriptSpecialRules.ts）
      selectedScript,
      nightCount,
      // 🧠 主谋「额外一夜一昼」状态写入（此前该状态从未被激活 ⇒ 规则不生效）
      setMastermindFinalDay,
      // 🔴 共享座位镜像：杜绝「控制器 ref 已更新、dispatcher ref 仍是上一帧」
      //   导致的 checkGameOver 旧数组写回（贞洁者处决被抹掉的根因）
      seatsRef
    );

  /**
   * 🔴 渲染期回填「能力击杀后的终局判定」入口（与 `seatsRef.current = seats` 同一套路）。
   *
   * ⚠️ 幂等保护：`victoryRef.current` 已有值 ⇒ 说明本局已终局 ⇒ **跳过**，
   *   避免「小恶魔传位」等既有路径（自己也会调 `checkGameOver`）造成**重复判定/重复战报日志**。
   */
  gameOverRef.current = {
    run: (_s: Seat[]) => {
      if (victoryRef.current) return;
      checkGameOver(seatsRef.current);
    },
  };

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

  // 🔧 死亡触发角色修复（2026-09-21 P1-9）：恶魔/处决杀死某角色后，**当晚**为其插入唤醒节点。
  //   ⚠️ 原为硬编码 `getSeatRoleId(targetId) !== "ravenkeeper"`（函数名亦为
  //   `enqueueRavenkeeperIfNeeded`）⇒ 其他死亡触发角色（farmer/banshee/moonchild/
  //   plague_doctor/sweetheart/barber/hatter）死亡当晚**静默返回、永不入队**。
  //   ✅ 改走 SST `isDeathTriggeredRole`，与 `GameStage.tsx::canActWhileDead` 同源。
  //   🔒 禁止在此硬编码角色名（护栏 ⑥ 源码级扫描会把关）。
  //   插入点用 wakeIndexRef.current + 1（当前行动节点之后），不能用 React state
  //   currentWakeIndex（滞后，小恶魔行动时仍是上一个角色的索引，会把守鸦人插到
  //   当前行动节点之前而被跳过）。同时同步写 wakeQueueIdsRef 供
  //   useNightSnapshot 的 continueToNextAction/updateSnapshot 读取最新队列。
  const enqueueDeathTriggeredIfNeeded = useCallback(
    (targetId: number) => {
      if (!isDeathTriggeredRole(getSeatRoleId(targetId))) return;
      // 🔧 结果不展示修复：入队时同步设置 hasAbilityEvenDead=true，
      //   否则死亡后执行时被 preProcessAbility 的"已死亡"校验拦截，导致没有任何结算结果。
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
  // 自动保存游戏快照到 localStorage（进行中的对局：排除 setup/check/scriptSelection/gameOver）
  useEffect(() => {
    const inProgressPhases = [
      "firstNight",
      "night",
      "day",
      "dusk",
      "voting",
      "nightSummary",
    ];
    /**
     * ⚠️ 2026-10-21（seed 94013 实测）：**终局快照必须落盘**。
     *
     *   此前只存「进行中」的快照 ⇒ 终局那一刻的状态（尤其**角色身份的变化**）
     *   永远存不下来。典型：方古跳变（外来者变恶魔、原恶魔死亡）恰好就是终局条件，
     *   于是持久化快照里的该座位仍是**旧身份**（外来者）⇒ 任何按快照复核
     *   「官方四条」的判据都会读出「恶魔已死 ⇒ 善良胜」，与真实胜方（邪恶胜）相反。
     *
     *   终局快照带 `winResult` + `gamePhase=gameOver`
     *   ⇒ `isRealUnfinishedGame` 判 false ⇒ 不会被当成「可续局对局」，
     *   与「终局不可续局」的既有语义一致。
     */
    const isTerminal = gamePhase === "gameOver" || !!gameState.winResult;
    if (
      isTerminal ||
      (inProgressPhases.includes(gamePhase) && !gameState.winResult)
    ) {
      const snapshot = createSnapshotFromState(gameState as any);
      saveCurrentSnapshot(snapshot);
    }
  }, [gamePhase, gameState]);

  const continueToNextAction = useCallback(
    (latestSeats?: Seat[]) => {
      /**
       * 🏁 终局态**不可被推进覆盖**（2026-10-21 · seed 94013 实测）。
       *
       *   真实缺陷链（梦殒春宵 5 人局）：
       *     ① 第 4 夜方古杀死外来者呆瓜 ⇒ 呆瓜变方古、原方古死亡（角色身份转移）；
       *     ② `checkGameOver` 判出「存活仅剩 2 人 ⇒ 邪恶胜」⇒ 相位已置 `gameOver`；
       *     ③ 但紧接着的「夜晚结束」把相位改回 `dawnReport`、并用「平安夜」弹窗
       *        顶掉胜利弹窗 ⇒ **终局被抹掉**，对局继续跑到第 13 夜仍未终局。
       *     ④ 更糟的是 `victoryRef` 已置位 ⇒ 后续所有终局兜底判据（存活阈值等）
       *        全部被 `victoryRef.current` 门禁挡掉 ⇒ 永远补不回来。
       *
       *   ⇒ 胜负一旦判出，夜晚**不得**再推进/切相位。
       */
      if (victoryRef.current) return;
      rawContinueToNextAction(latestSeats);
      // BUG FIX: 推进到下一步时必须清除已选目标，否则下一个步骤会沿用旧的目标
      setSelectedActionTargets([]);
    },
    [rawContinueToNextAction, setSelectedActionTargets, victoryRef]
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
    evilTwinPair,
    twilightVoteTargets,
    travelerHookChoices,
    travelers,
    travelerAlignments,
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
    undo: handleGlobalUndo,
    dispatch: logicDispatch,
    baseDispatch,
    getRandom,
    getAliveNeighbors,
    isGoodAlignment,
    addPoisonMark,
    computeIsPoisoned,
    handleNightAction: nightActionHandler.handleNightAction,
    executePoisonActionFn: executePoisonAction,
    enqueueDeathTriggeredIfNeeded,
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
    cancelHadesia,
    confirmSaintExecution,
    cancelSaintExecution,
    confirmScapegoatSubstitute,
    cancelScapegoatSubstitute,
    fireGunslinger,
    cancelGunslingerFire,
    confirmEvilTwinExecution,
    cancelEvilTwinExecution,
    confirmRavenkeeperFake,
    confirmVirginTrigger,
    confirmRestart,
  } = confirmHandlers;

  const dayActions = useDayActions({
    seats,
    roles,
    currentModal,
    gamePhase,
    nightCount,
    nominationMap,
    nominationRecords,
    witchActive,
    witchCursedId,
    travelers,
    virginGuideInfo: gameState.virginGuideInfo,
    dayAbilityForm: gameState.dayAbilityForm,
    cerenovusTarget: gameState.cerenovusTarget,
    setCerenovusTarget,
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
          // 🗣️ 造谣者：白天声明与真假裁定必须进管道（否则夜间恒判「声明错误」）
          gossipStatementToday,
          gossipTrueTonight,
          // 🌙 本夜已唤醒集合（侍女统计的唯一来源）
          wokenThisNight: wokenThisNightRef.current,
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
          //   必须用本组件的旧版 enqueueDeathTriggeredIfNeeded（操作真正驱动夜间
          //   UI 的 wakeQueueIds + 设 hasAbilityEvenDead），不能用 nightLogic
          //   的新引擎版（插入 NightEngine.queue，但该队列不驱动夜间 UI，
          //   且后续夜晚 engine.queueIterator 为 null → 插入无效）。
          enqueueDeathTriggeredIfNeeded,
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
    // 🛠️ 右键菜单「修补匠猝死 / 造谣者声明」的统一日间能力入口
    handleDayAbility,
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
      /**
       * 🔴🔴 2026-10-21 移除：原来这里写着
       *   「夜晚有镇民死亡 ⇒ 让**爪牙**醉酒」
       * 与官方**三处全反**（详见 `utils/minstrelRule.ts` 头注释）：
       *   · 触发事件应为「爪牙**死于处决**」，不是「夜晚有镇民死亡」；
       *   · 受罚对象应为「除吟游诗人与旅行者外的**所有人**」，不是只爪牙。
       * 而且写在这里（夜晚结束分支）根本无法命中处决场景 ——
       * 处决发生在白天。
       * ⇒ 正确实现已迁到 `killPlayer`（处决致死后的唯一咽喉），
       *   判据唯一入口 `resolveMinstrelIntoxication()`。
       */

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
          showAlert(
            "当前阵容缺少恶魔角色，无法开始游戏。请至少分配一名恶魔或军团。"
          );
          return;
        }

        // 场上角色齐全但今夜确无行动角色（如军团且罂粟种植者在场，且其他镇民首夜无唤醒能力）
        showAlert(
          "🌙 首夜平安度过：场上所有角色在首夜均无唤醒行动，直接进入第一天。"
        );
        addLog(
          "🌙 首夜平安度过：场上无任何角色需要唤醒行动，直接进入第一天白天。"
        );
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

      // 构建系统步骤映射（minion_info / demon_info / good_twin_info -> 队列索引 idx，避免覆盖同座位真实角色的技能）
      const stepMap = new Map<number, string>();
      queue.forEach((node: any, idx: number) => {
        const seat = seats.find((s) => s.id === node.seatId);
        if (
          node.roleId === "minion_info" ||
          node.roleId === "demon_info" ||
          node.roleId === LEGION_MUTUAL_RECOGNITION_ID ||
          node.roleId === "good_twin_info" ||
          (seat && node.roleId !== seat.role?.id)
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
      /**
       * 🌪️ 涡流「今日无人被处决 ⇒ 邪恶获胜」——**黄昏 → 入夜的唯一收口点**。
       *
       * 🔴 2026-10-22 修复：这条规则此前只在「有提名、但最终没处决」的路径里生效
       *   （`gameLogic.checkGameEnd` 的 `lastAction === "execution"` 分支）。
       *   玩家**完全跳过提名、直接点「入夜」**时没人判胜 ⇒ 游戏照常进第 2 夜
       *   （实测 S11：第 1 昼不提名，`isVortoxDuskWinActive` 这个 SST 判据
       *   **全仓库零生产调用点**，只有它自己的单测）。
       *   这里在入夜前补一次判定，与上面那条路径共用同一个判据与胜因文案，
       *   并按项目既有约定（终局四条）写 `winResult/winReason/gamePhase/GAME_OVER`。
       *
       * ⚠️ 幂等：`victoryRef.current` 已有值（上一路径已判过）⇒ 直接进夜。
       */
      if (
        !victoryRef.current &&
        isVortoxDuskWinActive(seatsRef.current, todayExecutedId != null)
      ) {
        addLog("⚖️ 涡流：今日无人被处决 ⇒ 邪恶阵营获胜！");
        setWinResult("evil");
        setWinReason("涡流：今日无人被处决");
        setGamePhase("gameOver");
        setCurrentModal({ type: "GAME_OVER", data: null });
        return;
      }
      // 🌙 新的一夜：清空「本夜已唤醒」，否则上一夜的唤醒记录会污染侍女统计
      wokenThisNightRef.current = new Set();
      startSubsequentNight();
    };
    const listenerId = unifiedEventBus.on(
      "startSubsequentNight",
      handleStartSubsequentNight
    );
    return () => {
      unifiedEventBus.off("startSubsequentNight", listenerId);
    };
    // todayExecutedId 必须进依赖：否则闭包读到白天开始时的旧值（= null），
    // 处决过的一天也会被误判成「今日无人被处决」
  }, [startSubsequentNight, todayExecutedId]);

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
        // 🌀 2026-09-12 修复：「行动顺序」面板的队列快照此前**漏掉了 apparentDemonRole**，
        //    导致 dynamicQueueGenerator 里的疯子分支读不到假身份 →
        //    疯子伪装成军团时面板仍显示「疯子(恶魔互认)」，与身份自相矛盾。
        //    （顺序修正不依赖该字段，所以之前只修顺序时看起来"标签没跟着变"。）
        apparentDemonRole: (s as any).apparentDemonRole,
        isDead: !!s.isDead,
        isDemonSuccessor: s.isDemonSuccessor,
        // ⚠️⚠️ 2026-09-20 修复 P1-1：队列快照此前**漏掉 statusDetails** ——
        //   而赏金猎人的条件唤醒门（`requiresKnownTargetDead`）判据正是
        //   `seat.statusDetails` 里的「赏金已知」标记。漏掉 → 门读不到 →
        //   每夜都被排入队列、白送一名邪恶玩家。
        statusDetails: (s as any).statusDetails,
        // ⚠️⚠️ 2026-10-20 修复（E2E 实测 seed=2026 实锤）：本预览快照此前**漏掉
        //   `isEvilConverted`** ⇒ `generateDynamicNightQueue` 的「邪恶阵营告知」分支
        //   （`convertedSeat` 判定）读不到该标记 → **面板队列缺首步**、与实际执行
        //   队列分叉。实证：真实生成器含 `9号:邪恶阵营告知` 且排在最前，面板却没有；
        //   该步骤又与图书管理员**同座位 8**，I10 按座位对账时被它抢走槽位 ⇒
        //   连带 4 条「步骤越序」全是误报。
        //   🔒 凡是 `generateDynamicNightQueue` 会读取的座位字段，本快照都必须透传。
        isEvilConverted: (s as any).isEvilConverted,
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
      cancelHadesia,
      confirmSaintExecution,
      cancelSaintExecution,
      confirmScapegoatSubstitute,
      cancelScapegoatSubstitute,
      fireGunslinger,
      cancelGunslingerFire,
      confirmEvilTwinExecution,
      cancelEvilTwinExecution,
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
      enqueueDeathTriggeredIfNeeded,
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
      cerenovusTarget: gameState.cerenovusTarget,
      setCerenovusTarget,
      setSeats: commitSeats,
      dispatch: baseDispatch,
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
      enqueueDeathTriggeredIfNeeded,
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
      cancelHadesia,
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
      cancelSaintExecution,
      confirmScapegoatSubstitute,
      cancelScapegoatSubstitute,
      fireGunslinger,
      cancelGunslingerFire,
      confirmEvilTwinExecution,
      cancelEvilTwinExecution,
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
