/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo } from "react";
import type { GamePhase, Role, Seat } from "../../app/data";
import { gameActions } from "../contexts/GameContext";
import type { NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";
import { hasTeaLadyProtection } from "../utils/gameRules";
import type { executePoisonAction } from "./roleActionHandlers";
// 单数 useExecutionHandler 为本文件直接依赖的活代码（非死文件；勿因与复数 useExecutionHandlers 命名撞车而误删）
import { useExecutionHandler } from "./useExecutionHandler";
import type { NightActionHandlerContext } from "./useNightActionHandler";

/**
 * 处决/击杀/投票处理函数的依赖接口
 */
export interface ExecutionHandlersDeps {
  // State
  seats: Seat[];
  roles: Role[];
  nightInfo: NightInfoResult | null;
  currentModal: ModalType;
  gamePhase: GamePhase;
  nightCount: number;
  nominationMap: Record<number, number>;
  initialSeats: Seat[];
  voteRecords: { voterId: number; isDemon: boolean }[];
  isVortoxWorld: boolean;
  todayExecutedId: number | null;
  mastermindFinalDay: { active: boolean } | null;
  winResult: "good" | "evil" | null;
  winReason: string | null;

  // Setters
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
  setOutsiderDiedToday: (val: boolean) => void;
  setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>>;
  setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
  setTodayDemonVoted: React.Dispatch<React.SetStateAction<boolean>>;
  setTodayExecutedId: React.Dispatch<React.SetStateAction<number | null>>;
  setVotedThisRound: React.Dispatch<React.SetStateAction<number[]>>;
  setNominationRecords: React.Dispatch<
    React.SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>
  >;
  setNominationMap: React.Dispatch<
    React.SetStateAction<Record<number, number>>
  >;
  setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
  setWinResult: React.Dispatch<React.SetStateAction<"good" | "evil" | null>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  setMastermindFinalDay: React.Dispatch<
    React.SetStateAction<{ active: boolean } | null>
  >;
  setVoteInputValue: (val: string) => void;
  setShowVoteErrorToast: (val: boolean) => void;

  // Functions
  addLog: (msg: string) => void;
  addLogWithDeduplication: (
    msg: string,
    playerId?: number,
    roleName?: string
  ) => void;
  killPlayer: (targetId: number, options?: any) => void;
  continueToNextAction: () => void;
  checkGameOver: (
    seats: Seat[],
    executedPlayerId?: number | null,
    isEndOfDay?: boolean,
    damselGuessed?: boolean,
    klutzGuessedEvil?: boolean
  ) => void;
  isActorDisabledByPoisonOrDrunk: (...args: any[]) => boolean;
  getRegistrationCached: (targetPlayer: Seat, viewingRole?: Role | null) => any;
  saveHistory: () => void;
  dispatch: (action: any) => void;
  // baseDispatch: 上下文真正的 reducer dispatch（logicDispatch 不会更新 gamePhase 等主状态）
  baseDispatch: (action: any) => void;
  getRandom: <T>(arr: T[]) => T;
  getAliveNeighbors: (seats: Seat[], seatId: number) => Seat[];
  isGoodAlignment: (seat: Seat) => boolean;
  addPoisonMark: (...args: any[]) => any;
  computeIsPoisoned: (...args: any[]) => boolean;
  handleNightAction: (
    ctx: NightActionHandlerContext
  ) => boolean | Promise<boolean>;
  executePoisonActionFn: typeof executePoisonAction;
  enqueueRavenkeeperIfNeeded: (targetId: number) => void;
  markAbilityUsed: (roleId: string, seatId: number) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  reviveSeat: (seat: Seat) => Seat;
  insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;
  getMisinformation: { [roleId: string]: (data: any) => any };
  findNearestAliveNeighbor: (
    originId: number,
    direction: 1 | -1
  ) => Seat | null;

  // Sub-hook results
  nightLogic: {
    processDemonKill: (
      targetId: number,
      options?: any
    ) => "pending" | "resolved";
    startNight: (isFirstNight: boolean) => void;
  };

  // Refs
  processingRef: React.MutableRefObject<boolean>;
  moonchildChainPendingRef: React.MutableRefObject<boolean>;
}

/**
 * useExecutionHandlers - 处理处决、击杀、投票相关逻辑的 Hook
 * 从 useGameController 中提取
 */
export function useExecutionHandlers(deps: ExecutionHandlersDeps) {
  const {
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
    setCurrentModal,
    setSeats,
    setSelectedActionTargets,
    setOutsiderDiedToday,
    setWakeQueueIds,
    setDeadThisNight,
    setTodayDemonVoted,
    setTodayExecutedId,
    setVotedThisRound,
    setNominationRecords,
    setNominationMap,
    setWinReason,
    setMastermindFinalDay,
    setVoteInputValue,
    setShowVoteErrorToast,
    addLog,
    addLogWithDeduplication,
    killPlayer,
    continueToNextAction,
    checkGameOver,
    isActorDisabledByPoisonOrDrunk,
    getRegistrationCached,
    saveHistory,
    dispatch,
    baseDispatch,
    getRandom,
    getAliveNeighbors,
    isGoodAlignment,
    addPoisonMark,
    computeIsPoisoned,
    handleNightAction,
    executePoisonActionFn,
    enqueueRavenkeeperIfNeeded,
    nightLogic,
    processingRef,
    moonchildChainPendingRef,
    winResult,
    setWinResult,
    setGamePhase,
    markAbilityUsed,
    hasUsedAbility,
    reviveSeat,
    insertIntoWakeQueueAfterCurrent,
    getMisinformation,
    findNearestAliveNeighbor,
  } = deps;

  const { handleExecution } = useExecutionHandler();

  // Execute player (execution logic)
  const executePlayer = useCallback(
    (
      id: number,
      options?: { skipLunaticRps?: boolean; forceExecution?: boolean }
    ) => {
      const seatsSnapshot = seats;
      const t = seatsSnapshot.find((s) => s.id === id);
      if (!t || !t.role) return;

      // --- Modular onExecution Support ---
      const execResult = handleExecution({
        executedSeat: t,
        seats,
        gamePhase,
        nightCount,
        nominationMap,
        forceExecution: options?.forceExecution,
        skipLunaticRps: options?.skipLunaticRps,
        setSeats,
        setWinResult,
        setWinReason,
        setGamePhase,
        addLog,
        checkGameOver,
        setCurrentModal,
      });

      // If modular logic handled it or returned shouldWait, stop here
      if (execResult && (execResult.handled || execResult.shouldWait)) {
        return true;
      }

      // --- Legacy/Standard Execution Logic ---
      // Mid execution force override (If a player is executed due to madness, skip ability confirmations)
      if (t.isMad && options?.forceExecution) {
        // Log it
        addLog(`⚖️ ${t.id + 1}号因为处于疯狂状态，说书人决定强制执行处决！`);
        dispatch({ type: "EXECUTE_PLAYER", targetId: id });
        // 实际杀死玩家
        killPlayer(id, { source: "execution", recordNightDeath: false });
        addLog(`⚖️ ${id + 1}号玩家被处决死亡`);
        // 检查游戏是否结束
        checkGameOver(seatsSnapshot, id, false);
        return true;
      }

      // Saint: Confirm if not forced
      if (t.role.id === "saint" && !options?.forceExecution) {
        setCurrentModal({
          type: "SAINT_EXECUTION_CONFIRM",
          data: { targetId: id, skipLunaticRps: options?.skipLunaticRps },
        });
        return true;
      }
      // Psychopath: RPS if not skipped
      if (t.role.id === "psychopath" && !options?.skipLunaticRps) {
        const nominatorId = nominationMap[id] ?? null;
        setCurrentModal({
          type: "LUNATIC_RPS",
          data: { targetId: id, nominatorId },
        });
        return true;
      }

      // Atomic Dispatch
      dispatch({ type: "EXECUTE_PLAYER", targetId: id });

      // 实际杀死玩家（关键修复：处决必须实际杀死玩家）
      killPlayer(id, { source: "execution", recordNightDeath: false });
      addLog(`⚖️ ${id + 1}号玩家被处决死亡`);

      // Godfather: If outsider executed, trigger night ability
      if (t.role.type === "outsider") {
        setOutsiderDiedToday(true);
        addLog(
          "📜 规则提示：今日有外来者被处决，若场上有教父且未醉/毒，当晚将被唤醒执行额外杀人"
        );
      }

      // 🔧 吟游诗人（Bard）被动：爪牙死于处决 → 除吟游诗人、爪牙、旅行者外的存活玩家醉酒直到明天黄昏
      const bardSeat = seatsSnapshot.find(
        (s) => s.role?.id === "bard" && !s.isDead
      );
      const isMinionExecuted = t.role.type === "minion";
      if (bardSeat && isMinionExecuted) {
        const drunkIds = seatsSnapshot
          .filter(
            (s) =>
              !s.isDead &&
              s.id !== bardSeat.id &&
              s.role?.type !== "minion" &&
              s.role?.type !== "traveler"
          )
          .map((s) => s.id);
        if (drunkIds.length > 0) {
          setSeats((prev: Seat[]) =>
            prev.map((s) =>
              drunkIds.includes(s.id)
                ? {
                    ...s,
                    isDrunk: true,
                    statusEffects: [
                      ...(s.statusEffects ?? []).filter(
                        (e: any) => !(e.type === "drunk" && e.source === "bard")
                      ),
                      {
                        type: "drunk",
                        source: "bard",
                        appliedAtNight: nightCount,
                        expiresAtNight: nightCount + 1,
                        duration: 1,
                      },
                    ],
                    statuses: [
                      ...(s.statuses ?? []).filter(
                        (st: any) =>
                          !(st.effect === "Drunk" && st.duration === "至下个黄昏")
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
          addLog(
            `🎵 吟游诗人能力触发：${id + 1}号爪牙被处决，其他非爪牙存活玩家醉酒直到明天黄昏`
          );
        }
      }

      // 检查游戏是否结束（处决后立即检查）
      checkGameOver(seatsSnapshot, id, false);

      return !!execResult?.modal;
    },
    [
      dispatch,
      seats,
      nominationMap,
      setCurrentModal,
      setOutsiderDiedToday,
      addLog,
      handleExecution,
      setSeats,
      setWinResult,
      setWinReason,
      setGamePhase,
      checkGameOver,
      gamePhase,
      nightCount,
      killPlayer,
    ]
  );

  // Confirm kill handler
  const confirmKill = useCallback(() => {
    if (!nightInfo || !currentModal || currentModal.type !== "KILL_CONFIRM")
      return;

    if (processingRef.current) return;
    processingRef.current = true;

    const targetId = (currentModal.data as { targetId: number }).targetId;
    const impSeat = nightInfo.seat;

    const actorSeat = seats.find((s) => s.id === nightInfo?.seat?.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo?.effectiveRole?.name ?? ""}) 处于中毒/醉酒状态，本夜对${targetId + 1}号的攻击无效，无事发生`,
        nightInfo.seat.id,
        nightInfo.effectiveRole.name
      );
      setCurrentModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }

    // 小恶魔自杀逻辑 (Star Pass)
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === "imp") {
      const aliveMinions = seats.filter(
        (s) => s.role?.type === "minion" && !s.isDead && s.id !== impSeat.id
      );

      if (aliveMinions.length > 0) {
        const newImp = getRandom(aliveMinions);
        dispatch({
          type: "IMP_STAR_PASS",
          oldImpId: impSeat.id,
          newImpId: newImp.id,
        });

        setWakeQueueIds((prev) => prev.filter((id) => id !== impSeat.id));
        setDeadThisNight((prev) => [...prev, impSeat.id]);
        enqueueRavenkeeperIfNeeded(impSeat.id);

        console.warn(
          `%c 小恶魔传位成功 -> ${newImp.id + 1}号`,
          "color: #FFD700; font-weight: bold;"
        );

        setCurrentModal(null);
        return;
      } else {
        addLogWithDeduplication(
          `${impSeat.id + 1}号(小恶魔) 自杀但无爪牙传位，直接死亡`,
          impSeat.id,
          "小恶魔"
        );
        dispatch({
          type: "KILL_PLAYER",
          targetId: impSeat.id,
          source: "demon",
        });
        setCurrentModal(null);
        return;
      }
    } else {
      const result = nightLogic.processDemonKill(targetId);
      if (result === "pending") return;
    }
    setCurrentModal(null);
    if (moonchildChainPendingRef.current) {
      processingRef.current = false;
      return;
    }

    setTimeout(() => {
      continueToNextAction();
      processingRef.current = false;
    }, 50);
  }, [
    nightInfo,
    currentModal,
    seats,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    setCurrentModal,
    setSelectedActionTargets,
    continueToNextAction,
    getRandom,
    setWakeQueueIds,
    setDeadThisNight,
    enqueueRavenkeeperIfNeeded,
    nightLogic,
    moonchildChainPendingRef,
    dispatch,
    processingRef,
  ]);

  // Submit votes handler
  const submitVotes = useCallback(
    (v: number, voters?: number[]) => {
      if (currentModal?.type !== "VOTE_INPUT") return;
      const voterId = currentModal.data.voterId;

      const initialPlayerCount =
        initialSeats.length > 0
          ? initialSeats.filter((s) => s.role !== null).length
          : seats.filter((s) => s.role !== null).length;

      if (Number.isNaN(v) || v < 0 || !Number.isInteger(v)) {
        alert("票数必须是大于等于0的整数");
        return;
      }

      if (v > initialPlayerCount) {
        alert(`票数不能超过开局时的玩家数${initialPlayerCount}人`);
        return;
      }

      if (voters && voters.length > 0) {
        const invalidDead = voters.some((id) => {
          const seat = seats.find((s) => s.id === id);
          return seat?.isDead && seat.hasGhostVote === false;
        });
        if (invalidDead) {
          alert("存在已用完幽灵票的死亡玩家，无法计票");
          return;
        }

        // 管家（Butler）规则检查：如果管家投票但主人不投票，管家票计为0
        for (const voterId of voters) {
          const voterSeat = seats.find((s) => s.id === voterId);
          if (!voterSeat) continue;
          const isButler =
            voterSeat.role?.id === "butler" ||
            voterSeat.role?.id === "qutler" ||
            (voterSeat as any).masterId !== undefined;
          // 🔧 防御：masterId 无效（null/undefined/等于自己）时不做管家拦截，
          // 避免初始化值为 null 时误报"主人未投票"（null !== undefined 的坑）
          const rawMaster = (voterSeat as any).masterId;
          const hasValidMaster =
            rawMaster !== undefined &&
            rawMaster !== null &&
            rawMaster !== voterId;
          if (isButler && hasValidMaster) {
            const masterId = rawMaster;
            const masterVoting = voters.includes(masterId);
            if (!masterVoting) {
              alert(
                `管家(${voterId + 1}号)的票不计入：主人(${masterId + 1}号)未投票（规则：如果仅管家投票而主人不投票，则管家票计为0票）`
              );
              // 移除管家的投票记录
              const filteredVoters = voters.filter((id) => id !== voterId);
              // 重新调用submitVotes，但不含管家
              if (filteredVoters.length === 0) {
                // 🔧 0 票合法：移除管家后无人投票 → 按 0 票提交（无人上台，不处决）
                submitVotes(0, []);
                return;
              }
              submitVotes(v, filteredVoters);
              return;
            }
          }
        }
      }

      saveHistory();

      const voteRecord = voteRecords.find((r) => r.voterId === voterId);
      const isDemonVote = voteRecord?.isDemon || false;
      if (isDemonVote) {
        setTodayDemonVoted(true);
      }

      const aliveCoreSeats = seats.filter(
        (s) => !s.isDead && s.role && s.role.type !== "traveler"
      );
      const aliveCount = aliveCoreSeats.length;
      const threshold = Math.floor(aliveCount / 2) + 1;

      setSeats((prev) =>
        prev.map((s) => {
          let next = s;
          if (voters?.includes(s.id) && s.isDead && s.hasGhostVote) {
            next = { ...next, hasGhostVote: false };
          }
          if (s.id === voterId) {
            next = { ...next, voteCount: v, isCandidate: v >= threshold };
          }
          return next;
        })
      );

      if (voters) {
        setVotedThisRound(voters);
      }

      const voterSeat = seats.find((s) => s.id === voterId);
      const voterListText = voters?.length
        ? ` | 投票者: ${voters.map((id) => `${id + 1}号`).join("、")}`
        : "";
      addLog(
        `${voterId + 1}号获得 ${v} 票${v >= threshold ? " (上台)" : ""}${isDemonVote ? "，恶魔投票" : ""}${voterSeat?.isDead ? "（死亡玩家投票）" : ""}${voterListText}`
      );
      setVoteInputValue("");
      setShowVoteErrorToast(false);
      setCurrentModal(null);

      // 检查维齐尔强制处决能力
      const activeVizier = seats.find(
        (s) =>
          s.role?.id === "vizier" &&
          !s.isDead &&
          !isActorDisabledByPoisonOrDrunk(s)
      );

      if (activeVizier && voters && voters.length > 0) {
        // 检查是否有善良玩家参与投票
        const hasGoodVoter = voters.some((voterId) => {
          const voterSeat = seats.find((s) => s.id === voterId);
          return voterSeat && isGoodAlignment(voterSeat);
        });

        if (hasGoodVoter) {
          // 维齐尔可以选择强制处决
          setCurrentModal({
            type: "VIZIER_EXECUTION",
            data: {
              targetId: voterId,
              vizierId: activeVizier.id,
              onResolve: (execute: boolean) => {
                if (execute) {
                  // 维齐尔选择强制处决
                  addLog(
                    `维齐尔(${activeVizier.id + 1}号)使用能力强制处决${voterId + 1}号`
                  );
                  const modalShown = executePlayer(voterId);
                  if (!modalShown) {
                    setCurrentModal({
                      type: "EXECUTION_RESULT",
                      data: { message: `${voterId + 1}号被维齐尔强制处决` },
                    });
                  }
                  // 维齐尔强制处决后，当天不再有更多提名、投票和处决
                  setTodayExecutedId(voterId);
                } else {
                  // 维齐尔选择不使用能力
                  addLog(
                    `维齐尔(${activeVizier.id + 1}号)选择不使用强制处决能力`
                  );
                }
              },
            },
          });
        }
      }
    },
    [
      currentModal,
      initialSeats,
      seats,
      voteRecords,
      saveHistory,
      setTodayDemonVoted,
      setSeats,
      addLog,
      setVoteInputValue,
      setShowVoteErrorToast,
      setCurrentModal,
      setVotedThisRound,
      executePlayer,
      isGoodAlignment,
      isActorDisabledByPoisonOrDrunk,
      setTodayExecutedId,
    ]
  );

  // Execute judgment handler
  const executeJudgment = useCallback(() => {
    saveHistory();

    // 检查今天是否已经有过处决
    if (todayExecutedId !== null) {
      setCurrentModal({
        type: "EXECUTION_RESULT",
        data: { message: "今天已经有过处决，不能再进行处决" },
      });
      return;
    }

    const cands = seats
      .filter((s) => s.isCandidate)
      .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    if (cands.length === 0) {
      setCurrentModal({
        type: "EXECUTION_RESULT",
        data: { message: "无人上台无人被处决" },
      });
      return;
    }

    const aliveCoreSeats = seats.filter(
      (s) => !s.isDead && s.role && s.role.type !== "traveler"
    );
    const aliveCount = aliveCoreSeats.length;
    // 正确规则：达到半数（≥50%）即可上处决台
    // 例如 6 人存活，Math.ceil(6/2) = 3，3 票即可
    const threshold = Math.ceil(aliveCount / 2);

    const max = cands[0].voteCount || 0;

    const qualifiedCands = cands.filter((c) => (c.voteCount || 0) >= threshold);
    if (qualifiedCands.length === 0) {
      setCurrentModal({
        type: "EXECUTION_RESULT",
        data: { message: `最高票 ${max} 未达到半数 ${threshold}，无人被处决` },
      });
      return;
    }

    const maxVoteCount = qualifiedCands[0].voteCount || 0;
    const tops = qualifiedCands.filter((c) => c.voteCount === maxVoteCount);

    if (tops.length > 1) {
      setCurrentModal({
        type: "EXECUTION_RESULT",
        data: {
          message: `平票（${tops.length}人并列最高票 ${maxVoteCount}），平安日无人被处决`,
        },
      });
    } else if (tops.length === 1) {
      const executed = tops[0];

      // 1. 茶艺师保护逻辑
      if (hasTeaLadyProtection(executed, seats)) {
        const msg = `由于茶艺师保护，${executed.id + 1}号免于处决`;
        addLog(msg);
        setCurrentModal({ type: "EXECUTION_RESULT", data: { message: msg } });
        return;
      }

      // 2. 和平主义者逻辑
      const activePacifist = seats.find(
        (s) =>
          s.role?.id === "pacifist" &&
          !s.isDead &&
          !isActorDisabledByPoisonOrDrunk(s)
      );
      if (activePacifist && isGoodAlignment(executed)) {
        setCurrentModal({
          type: "PACIFIST_CONFIRM",
          data: {
            targetId: executed.id,
            onResolve: (saved: boolean) => {
              if (saved) {
                const msg = `由于和平主义者能力，${executed.id + 1}号免于死亡`;
                addLog(msg);
                setCurrentModal({
                  type: "EXECUTION_RESULT",
                  data: { message: msg },
                });
              } else {
                const modalShown = executePlayer(executed.id);
                if (!modalShown) {
                  setCurrentModal({
                    type: "EXECUTION_RESULT",
                    data: { message: `${executed.id + 1}号被处决` },
                  });
                }
              }
            },
          },
        });
        return;
      }

      const modalShown = executePlayer(executed.id);
      if (!modalShown) {
        setCurrentModal({
          type: "EXECUTION_RESULT",
          data: { message: `${executed.id + 1}号被处决` },
        });
      }
    }
  }, [
    saveHistory,
    seats,
    setCurrentModal,
    isGoodAlignment,
    executePlayer,
    addLog,
    isActorDisabledByPoisonOrDrunk,
    todayExecutedId,
  ]);

  // Confirm poison handler
  const confirmPoison = useCallback(async () => {
    if (!nightInfo || !currentModal || currentModal.type !== "POISON_CONFIRM")
      return;

    if (processingRef.current) return;
    processingRef.current = true;

    const targetId = (currentModal.data as { targetId: number }).targetId;
    setCurrentModal(null);

    const nightActionHandlerContext: NightActionHandlerContext = {
      nightInfo,
      seats,
      selectedTargets: [targetId],
      gamePhase,
      nightCount,
      roles,
      setSeats,
      setSelectedActionTargets,
      addLog: addLogWithDeduplication,
      continueToNextAction,
      setCurrentModal,
      isConfirmed: true,
      markAbilityUsed,
      hasUsedAbility,
      reviveSeat,
      insertIntoWakeQueueAfterCurrent,
      vortoxWorld: isVortoxWorld,
      getRegistration: getRegistrationCached,
      getMisinformation,
      findNearestAliveNeighbor,
    };

    const handled = await handleNightAction(nightActionHandlerContext);
    if (!handled) {
      const delayedContinue = () => {
        setTimeout(() => {
          continueToNextAction();
          processingRef.current = false;
        }, 50);
      };
      executePoisonActionFn(targetId, false, {
        nightInfo,
        seats,
        setSeats,
        setCurrentModal: () => {},
        setSelectedActionTargets: () => {},
        continueToNextAction: delayedContinue,
        isActorDisabledByPoisonOrDrunk,
        addLogWithDeduplication,
        addPoisonMark,
        computeIsPoisoned,
        markAbilityUsed,
      });
    } else {
      setTimeout(() => {
        processingRef.current = false;
      }, 50);
    }
  }, [
    currentModal,
    nightInfo,
    seats,
    setSeats,
    setCurrentModal,
    setSelectedActionTargets,
    continueToNextAction,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    addPoisonMark,
    computeIsPoisoned,
    executePoisonActionFn,
    gamePhase,
    nightCount,
    roles,
    handleNightAction,
    findNearestAliveNeighbor,
    getMisinformation,
    getRegistrationCached,
    hasUsedAbility,
    insertIntoWakeQueueAfterCurrent,
    isVortoxWorld,
    markAbilityUsed,
    processingRef,
    reviveSeat,
  ]);

  // Confirm poison evil handler
  const confirmPoisonEvil = useCallback(async () => {
    if (
      !nightInfo ||
      !currentModal ||
      currentModal.type !== "POISON_EVIL_CONFIRM"
    )
      return;

    if (processingRef.current) return;
    processingRef.current = true;

    const targetId = (currentModal.data as { targetId: number }).targetId;
    setCurrentModal(null);

    const nightActionHandlerContext: NightActionHandlerContext = {
      nightInfo,
      seats,
      selectedTargets: [targetId],
      gamePhase,
      nightCount,
      roles,
      setSeats,
      setSelectedActionTargets,
      addLog: addLogWithDeduplication,
      continueToNextAction,
      setCurrentModal,
      isConfirmed: true,
      markAbilityUsed,
      hasUsedAbility,
      reviveSeat,
      insertIntoWakeQueueAfterCurrent,
      vortoxWorld: isVortoxWorld,
      getRegistration: getRegistrationCached,
      getMisinformation,
      findNearestAliveNeighbor,
    };

    const handled = await handleNightAction(nightActionHandlerContext);
    if (!handled) {
      const delayedContinue = () => {
        setTimeout(() => {
          continueToNextAction();
          processingRef.current = false;
        }, 50);
      };
      executePoisonActionFn(targetId, true, {
        nightInfo,
        seats,
        setSeats,
        setCurrentModal: () => {},
        setSelectedActionTargets: () => {},
        continueToNextAction: delayedContinue,
        isActorDisabledByPoisonOrDrunk,
        addLogWithDeduplication,
        addPoisonMark,
        computeIsPoisoned,
        markAbilityUsed,
      });
    } else {
      setTimeout(() => {
        processingRef.current = false;
      }, 50);
    }
  }, [
    currentModal,
    nightInfo,
    seats,
    setSeats,
    setCurrentModal,
    setSelectedActionTargets,
    continueToNextAction,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    addPoisonMark,
    computeIsPoisoned,
    executePoisonActionFn,
    gamePhase,
    nightCount,
    roles,
    handleNightAction,
    findNearestAliveNeighbor,
    getMisinformation,
    getRegistrationCached,
    hasUsedAbility,
    insertIntoWakeQueueAfterCurrent,
    isVortoxWorld,
    markAbilityUsed,
    processingRef,
    reviveSeat,
  ]);

  /**
   * 进入后续夜晚（处决/黄昏后）
   *
   * 修复（W7.2.2）：原先只调用 nightLogic.startNight(false)（引擎内部状态机），
   * 但该调用不更新 React 的 gamePhase，导致黄昏→夜晚过渡后游戏仍停留在 "dusk"，
   * 玩家反复看到"执行处决"按钮却无法进入夜晚（死循环）。
   *
   * 现在对齐首夜进入逻辑：先跑引擎生成唤醒队列，再从引擎读取队列，
   * 完整设置 React 夜晚状态（wakeQueueIds / currentWakeIndex / gamePhase / nightCount）。
   */
  const startSubsequentNight = useCallback(() => {
    // 1. 运行引擎生成夜晚队列（供新引擎能力管道使用）
    nightLogic.startNight(false);

    // 2. 从引擎实例读取实时队列
    //    注意：nightLogic 在运行时确实持有 .engine（NightEngine 实例），
    //    但其类型声明较窄未暴露该字段，故用 any 转换（与 useGameController
    //    中 handleStartFirstNight 的读取方式一致）。
    const engineState: any = (nightLogic as any).engine?.state;
    const queue: any[] = engineState?.queue || [];

    if (queue.length === 0) {
      // 兜底：即使队列为空也强制进入夜晚，避免卡在 dusk
      console.warn("[startSubsequentNight] 引擎队列为空，强制进入夜晚");
      baseDispatch(
        gameActions.updateState({
          nightCount: nightCount + 1,
          currentWakeIndex: 0,
        })
      );
      baseDispatch(gameActions.setGamePhase("night"));
      baseDispatch(gameActions.setModal(null));
      return;
    }

    // 3. 由队列节点 seatId 推导 wakeQueueIds（仅保留在场座位）
    //    与首夜 handleStartFirstNight 逻辑对齐：依据当前引擎快照重新生成队列，
    //    这样白天被处决/夜晚死亡的玩家不会在后续夜晚被错误唤醒。
    const wakeIds: number[] = queue
      .map((node: any) => node.seatId)
      .filter((id: number) => seats.some((s: Seat) => s.id === id));

    // 4. 完整设置 React 夜晚状态（对齐 confirmNightOrderPreview / 首夜流程）
    //    - 重新生成 wakeQueueIds（覆盖首夜缩水后的旧队列）
    //    - 复位 currentWakeIndex 以支持从队列头重新开始遍历
    //    - 清空上一天残留的选中目标与查验结果
    //    - 切换 gamePhase 到 "night" 并关闭模态框（修复 W7.2.2 dusk→night 死循环）
    //    关键：此处必须用 baseDispatch（上下文真正 reducer）而非 logicDispatch，
    //    因为 logicDispatch 不会更新 gamePhase / wakeQueueIds 等主状态。
    baseDispatch(
      gameActions.updateState({
        wakeQueueIds: wakeIds,
        currentWakeIndex: 0,
        selectedActionTargets: [],
        inspectionResult: null,
        nightCount: nightCount + 1,
      })
    );
    baseDispatch(gameActions.setGamePhase("night"));
    baseDispatch(gameActions.setModal(null));

    console.log(
      `[startSubsequentNight] 进入第 ${nightCount + 1} 夜，队列长度:`,
      wakeIds.length
    );
  }, [nightLogic, seats, nightCount, setGamePhase, dispatch, baseDispatch]);

  // Confirm execution result handler
  const confirmExecutionResult = useCallback(() => {
    if (currentModal?.type !== "EXECUTION_RESULT") return;
    const isVirginTrigger = currentModal.data.isVirginTrigger;
    setCurrentModal(null);

    if (isVirginTrigger) {
      startSubsequentNight();
      return;
    }

    // BMR：主谋额外一天的结算
    if (mastermindFinalDay?.active) {
      dispatch({
        type: "CHECK_GAME_OVER",
        executedId: todayExecutedId ?? undefined,
        lastAction: todayExecutedId ? "execution" : "check_phase",
        context: {
          isMastermindActive: true,
        },
      });
      setMastermindFinalDay(null);
      return;
    }

    const cands = seats
      .filter((s) => s.isCandidate)
      .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    if (cands.length === 0) {
      startSubsequentNight();
      return;
    }

    const aliveCoreSeats = seats.filter(
      (s) => !s.isDead && s.role && s.role.type !== "traveler"
    );
    const aliveCount = aliveCoreSeats.length;
    const threshold = Math.floor(aliveCount / 2) + 1;

    const _max = cands[0].voteCount || 0;
    const qualifiedCands = cands.filter((c) => (c.voteCount || 0) >= threshold);
    const maxVoteCount =
      qualifiedCands.length > 0 ? qualifiedCands[0].voteCount || 0 : 0;
    const tops = qualifiedCands.filter((c) => c.voteCount === maxVoteCount);
    if (tops.length !== 1) {
      if (isVortoxWorld && todayExecutedId === null) {
        dispatch({
          type: "CHECK_GAME_OVER",
          executedId: undefined,
          lastAction: "execution",
          context: { isVortoxWorld },
        });
        return;
      }
      startSubsequentNight();
    } else {
      // 正常处决（恰一名候选人得票达标）：确认后直接进入下一夜。
      // 此前该分支为空，导致黄昏处决后游戏停留在 "dusk" 无法进入夜晚（死循环）。
      // 注意：tops.length===1 时 someone 已被 executeJudgment→executePlayer 实际处决，
      // 这里只需推进阶段到夜晚。
      // 防护：若处决本身已使游戏结束（如处决了恶魔→善良胜利），则不进入夜晚，
      // 保持 gameOver 阶段（checkGameOver 已在 executePlayer 中设置 winResult）。
      if (winResult) {
        console.log(
          "[confirmExecutionResult] 处决已导致游戏结束，跳过进入夜晚"
        );
        return;
      }
      startSubsequentNight();
    }
  }, [
    currentModal,
    setCurrentModal,
    seats,
    isVortoxWorld,
    todayExecutedId,
    dispatch,
    mastermindFinalDay,
    setMastermindFinalDay,
    startSubsequentNight,
    winResult,
  ]);

  // Resolve lunatic RPS handler
  const resolveLunaticRps = useCallback(
    (result: "win" | "lose" | "tie") => {
      if (currentModal?.type !== "LUNATIC_RPS") return;
      const { targetId, nominatorId } = currentModal.data;
      const nominatorNote =
        nominatorId !== null ? `提名者${nominatorId + 1}号` : "";
      if (result === "lose") {
        addLog(
          `${targetId + 1}号(精神病患者) 在石头剪刀布中落败${nominatorNote}，被处决`
        );
        executePlayer(targetId, { skipLunaticRps: true });
        setCurrentModal({
          type: "EXECUTION_RESULT",
          data: { message: `${targetId + 1}号被处决，石头剪刀布落败` },
        });
      } else {
        if (nominatorId !== null) {
          addLog(
            `${targetId + 1}号(精神病患者) 在石头剪刀布中获胜或打平，${nominatorNote}提名者被处决`
          );
          killPlayer(nominatorId);
          setCurrentModal({
            type: "EXECUTION_RESULT",
            data: {
              message: `${nominatorId + 1}号被处决，因精神病患者猜拳获胜`,
            },
          });
        } else {
          addLog(
            `${targetId + 1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，处决取消`
          );
          setCurrentModal({
            type: "EXECUTION_RESULT",
            data: { message: `${targetId + 1}号存活，处决取消` },
          });
        }
        setSeats((p: Seat[]) =>
          p.map((s) => ({ ...s, isCandidate: false, voteCount: undefined }))
        );
        setNominationRecords({ nominators: new Set(), nominees: new Set() });
        setNominationMap({});
      }
      setCurrentModal(null);
    },
    [
      currentModal,
      executePlayer,
      addLog,
      setSeats,
      setCurrentModal,
      setNominationRecords,
      setNominationMap,
      killPlayer,
    ]
  );

  // Confirm shoot result handler
  const confirmShootResult = useCallback(() => {
    setCurrentModal(null);
  }, [setCurrentModal]);

  // Handle slayer target selection
  const handleSlayerTargetSelect = useCallback(
    (targetId: number) => {
      if (currentModal?.type !== "SLAYER_SELECT_TARGET") return;
      const { shooterId } = currentModal.data;

      const shooter = seats.find((s) => s.id === shooterId);
      if (!shooter) return;

      saveHistory();
      setSeats((p: Seat[]) =>
        p.map((s) =>
          s.id === shooterId ? { ...s, hasUsedSlayerAbility: true } : s
        )
      );

      const target = seats.find((s) => s.id === targetId);
      if (!target) {
        alert("目标不存在");
        setCurrentModal(null);
        return;
      }

      if (target.isDead) {
        addLog(`${shooterId + 1}号对${targetId + 1}号的尸体开枪未产生效果`);
        setCurrentModal({
          type: "SHOOT_RESULT",
          data: { message: "无事发生目标已死亡", isDemonDead: false },
        });
        return;
      }

      const isRealSlayer =
        shooter.role?.id === "slayer" &&
        !isActorDisabledByPoisonOrDrunk(shooter) &&
        !shooter.isDead;
      const targetRegistration = getRegistrationCached(target, shooter.role);
      const isDemon = targetRegistration.registersAsDemon;

      if (isRealSlayer && isDemon) {
        addLog(`${shooterId + 1}号(猎手) 开枪击杀 ${targetId + 1}号(恶魔)`);
        addLog(
          "猎手的子弹击中了恶魔，按照规则游戏立即结束，不再进行今天的处决和后续夜晚"
        );
        setWinReason("猎手击杀恶魔");
        killPlayer(targetId, { skipGameOverCheck: false, isEndOfDay: true });
        setCurrentModal({
          type: "SHOOT_RESULT",
          data: { message: "恶魔死亡，善良阵营获胜", isDemonDead: true },
        });
      } else {
        const isPoisonedOrDrunk = isActorDisabledByPoisonOrDrunk(shooter);
        if (isPoisonedOrDrunk) {
          addLog(
            `${shooterId + 1}号(猎手) 开枪，但由于${shooter.isPoisoned ? "中毒" : "醉酒"}状态，能力失效`
          );
        } else {
          addLog(
            `${shooterId + 1}号${shooter.role?.id === "slayer" ? "(猎手)" : ""} 开枪，${targetId + 1}号不是恶魔`
          );
        }
        setCurrentModal({
          type: "SHOOT_RESULT",
          data: { message: "无事发生", isDemonDead: false },
        });
      }
    },
    [
      currentModal,
      seats,
      saveHistory,
      getRegistrationCached,
      addLog,
      setCurrentModal,
      setSeats,
      setWinReason,
      isActorDisabledByPoisonOrDrunk,
      killPlayer,
    ]
  );

  return useMemo(
    () => ({
      executePlayer,
      confirmKill,
      submitVotes,
      executeJudgment,
      confirmPoison,
      confirmPoisonEvil,
      startSubsequentNight,
      confirmExecutionResult,
      resolveLunaticRps,
      confirmShootResult,
      handleSlayerTargetSelect,
    }),
    [
      executePlayer,
      confirmKill,
      submitVotes,
      executeJudgment,
      confirmPoison,
      confirmPoisonEvil,
      startSubsequentNight,
      confirmExecutionResult,
      resolveLunaticRps,
      confirmShootResult,
      handleSlayerTargetSelect,
    ]
  );
}
