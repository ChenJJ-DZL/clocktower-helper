/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GamePhase,
  roles as globalRoles,
  type Role,
  type Seat,
} from "../../app/data";
import { gameActions, useGameContext } from "../contexts/GameContext";
import { gameEventBus } from "../utils/gameEventBus";
import { getRandom, isGoodAlignment } from "../utils/gameRules";

/**
 * UseGameFlowResult - 流程控制 Hook 的返回结果
 */
export interface UseGameFlowResult {
  gamePhase: GamePhase;
  nightCount: number;
  timer: number;
  isTimerRunning: boolean;
  handleTimerPause: () => void;
  handleTimerStart: () => void;
  handleTimerReset: () => void;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  setNightCount: React.Dispatch<React.SetStateAction<number>>;
  setTimer: React.Dispatch<React.SetStateAction<number>>;
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
  proceedToFirstNight: (roles?: Role[]) => void;
  confirmNightDeathReport: () => void;
  tickTimer: (delta: number) => void;
}

/**
 * useGameFlow - 游戏流程控制 Hook
 * 现已重构为原生使用 GameContext，消除冗余的 Prop Drilling
 */
export function useGameFlow(): UseGameFlowResult {
  const { state, dispatch } = useGameContext();
  const {
    gamePhase,
    nightCount,
    timer,
    mounted,
    seats,
    currentDuskExecution,
    lastDuskExecution,
    selectedScript,
    startTime,
    gameLogs,
    pendingNightQueue,
  } = state;

  // Timer running state
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  // 使用Ref保存最新timer值，避免依赖导致无限循环
  const timerRef = useRef<number>(timer);

  // 同步timer到Ref
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  // 当相位切换时自动重置计时器
  useEffect(() => {
    dispatch(gameActions.setTimer(0));
    setIsTimerRunning(true);
  }, [dispatch]);

  // 计时器逻辑
  useEffect(() => {
    if (!mounted || !isTimerRunning) return;
    const i = setInterval(() => {
      dispatch(gameActions.setTimer(timerRef.current + 1));
    }, 1000);
    return () => clearInterval(i);
  }, [mounted, isTimerRunning, dispatch]);

  const handleTimerPause = useCallback(() => setIsTimerRunning(false), []);
  const handleTimerStart = useCallback(() => setIsTimerRunning(true), []);
  const handleTimerReset = useCallback(() => {
    dispatch(gameActions.setTimer(0));
    setIsTimerRunning(true);
  }, [dispatch]);

  const startNight = useCallback(
    (isFirstNight: boolean) => {
      dispatch(gameActions.setGamePhase(isFirstNight ? "firstNight" : "night"));
      if (!isFirstNight) {
        dispatch(gameActions.updateState({ nightCount: state.nightCount + 1 }));
      }
    },
    [dispatch, state.nightCount]
  );

  const enterNightPhase = useCallback(
    (target: GamePhase, isFirstNight: boolean) => {
      dispatch(gameActions.setGamePhase(target));
      if (!isFirstNight) {
        dispatch(gameActions.updateState({ nightCount: state.nightCount + 1 }));
      }
    },
    [dispatch, state.nightCount]
  );

  const enterDayPhase = useCallback(() => {
    dispatch(gameActions.setGamePhase("day"));
  }, [dispatch]);

  const confirmNightDeathReport = useCallback(() => {
    enterDayPhase();
    dispatch(gameActions.updateState({ currentModal: null }));
  }, [enterDayPhase, dispatch]);

  const enterDuskPhase = useCallback(() => {
    // 保存历史 (这里需要实现 saveHistory 的 Action，目前先用 updateState 模拟)
    // dispatch(gameActions.saveHistory());

    // 进入新黄昏时保存处决记录供送葬者读取
    dispatch(gameActions.setDuskExecution(currentDuskExecution ?? null, null));

    // 每个新黄昏开始时，重置“白天有外来者死亡”标记
    dispatch(gameActions.setOutsiderDiedToday(false));

    // 清除临时状态
    const cleanedSeats = seats.map((s) => {
      const filteredStatusDetails = (s.statusDetails || []).filter((st) => {
        if (st.includes("永久中毒") || st.includes("永久")) return true;
        if (st.includes("普卡中毒")) return true;
        return !(
          st.includes("次日黄昏清除") ||
          st.includes("下个黄昏清除") ||
          st.includes("至下个黄昏清除") ||
          st.includes("次日黄昏") ||
          st.includes("下个黄昏")
        );
      });

      const filteredStatuses = (s.statuses || []).filter((status) => {
        const isTempPoisonOrDrunk =
          (status.effect === "Poison" || status.effect === "Drunk") &&
          typeof status.duration === "string" &&
          (status.duration.includes("次日黄昏") ||
            status.duration.includes("下个黄昏") ||
            status.duration.includes("黄昏清除") ||
            status.duration === "Night+Day" ||
            status.duration === "1 Day");
        return !isTempPoisonOrDrunk;
      });

      // 侍臣逻辑... (此处逻辑较细，暂时保持原样)
      const currentDecrementedStatuses = [...filteredStatuses];
      // (这里可以根据需要进一步完善)

      return {
        ...s,
        statusDetails: filteredStatusDetails,
        statuses: currentDecrementedStatuses,
        voteCount: undefined,
        isCandidate: false,
      };
    });

    dispatch(gameActions.setSeats(cleanedSeats));
    dispatch(gameActions.setGamePhase("dusk"));
    dispatch(
      gameActions.setNominationRecords({
        nominators: new Set(),
        nominees: new Set(),
      })
    );
    dispatch(
      gameActions.updateState({ nominationMap: {}, votedThisRound: [] })
    );
    dispatch(gameActions.setModal(null));
  }, [currentDuskExecution, seats, dispatch]);

  const handleDayEndTransition = useCallback(() => {
    // 根据官方血染钟楼规则：白天处决后立即进入夜晚
    // 每天最多1次正常处决，处决后不进行额外的提名和投票

    // 检查今日是否已有处决
    const hasExecutedToday = state.hasExecutedThisDay;

    if (hasExecutedToday) {
      // 今日已有处决，直接进入夜晚
      console.log("[handleDayEndTransition] 今日已有处决，直接进入夜晚");
      startNight(false); // 进入夜晚（非首夜）
    } else {
      // 今日尚无处决，进入黄昏（可以进行提名和投票）
      console.log("[handleDayEndTransition] 今日尚无处决，进入黄昏");
      enterDuskPhase();
    }
  }, [enterDuskPhase, startNight, state.hasExecutedThisDay]);

  const handleSwitchScript = useCallback(() => {
    // 结束当前游戏并重置
    dispatch(gameActions.updateState({ showIntroLoading: true }));
    dispatch(gameActions.setGamePhase("scriptSelection"));
    dispatch(
      gameActions.updateState({
        selectedScript: null,
        nightCount: 1,
        executedPlayerId: null,
        wakeQueueIds: [],
        currentWakeIndex: 0,
        selectedActionTargets: [],
        winResult: null,
        deadThisNight: [],
        pukkaPoisonQueue: [],
        selectedRole: null,
        inspectionResult: null,
        currentHint: { isPoisoned: false, guide: "", speak: "" },
        timer: 0,
        startTime: null,
        history: [],
        winReason: null,
      })
    );

    // 重置座位
    dispatch(
      gameActions.setSeats(
        Array.from({ length: 15 }, (_, i) => ({
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
          zombuulLives: 1,
        })) as any
      )
    );
  }, [dispatch]);

  const handleNewGame = useCallback(() => {
    handleSwitchScript(); // 对于简化版，行为一致
  }, [handleSwitchScript]);

  const proceedToCheckPhase = useCallback(
    (seatsToUse: Seat[]) => {
      const active = seatsToUse.filter((s) => s.role);
      const processedSeats = active.map((seat) => {
        let nextDisplayRole = seat.displayRole || seat.role;
        // 处理酒鬼和疯子的初始显示
        if (seat.role?.id === "drunk") {
          nextDisplayRole = seat.charadeRole || nextDisplayRole;
        }
        return { ...seat, displayRole: nextDisplayRole };
      });

      const compact = processedSeats.map((s, i) => ({ ...s, id: i }));

      // 占卜师红罗剎分配
      const withRed = [...compact];
      const ftIndex = withRed.findIndex((s) => s.role?.id === "fortune_teller");
      if (ftIndex !== -1 && !withRed.some((s) => s.isRedHerring)) {
        const goodCandidates = withRed.filter(
          (s) =>
            ["townsfolk", "outsider"].includes(s.role?.type || "") &&
            isGoodAlignment(s)
        );
        if (goodCandidates.length > 0) {
          const t = getRandom(goodCandidates);
          if (t) {
            withRed[t.id].isRedHerring = true;
            withRed[t.id].isFortuneTellerRedHerring = true;
            withRed[t.id].statusDetails = [
              ...(withRed[t.id].statusDetails || []),
              "天敌红罗剎",
            ];
            dispatch(
              gameActions.addLog({
                day: 0,
                phase: "setup",
                message: `天敌红罗剎分配${t.id + 1}号：${withRed[t.id].role?.name}`,
              })
            );
          }
        }
      }

      dispatch(gameActions.setSeats(withRed));
      dispatch(
        gameActions.updateState({
          initialSeats: JSON.parse(JSON.stringify(withRed)),
        })
      );
      dispatch(gameActions.setGamePhase("check"));
    },
    [dispatch]
  );

  const handlePreStartNight = useCallback(() => {
    proceedToCheckPhase(seats);
  }, [seats, proceedToCheckPhase]);

  const closeNightOrderPreview = useCallback(() => {
    dispatch(gameActions.setModal(null));
    dispatch(
      gameActions.updateState({
        pendingNightQueue: null,
      })
    );
  }, [dispatch]);

  const confirmNightOrderPreview = useCallback(() => {
    // 🛡️ Guard: If already in night phase, do NOT regenerate queue
    if (gamePhase === "firstNight" || gamePhase === "night") {
      console.warn(
        `[confirmNightOrderPreview] Already in ${gamePhase}, ignoring request.`
      );
      return;
    }

    // 如果队列不存在，说明预览模态框没有正确弹出，直接派发事件重新生成队列
    if (!pendingNightQueue || pendingNightQueue.length === 0) {
      console.warn(
        "[confirmNightOrderPreview] pendingNightQueue为空，重新触发首夜队列生成"
      );
      gameEventBus.emit("startFirstNight", {});
      return;
    }

    // 转换并启动夜晚
    const wakeIds = pendingNightQueue.map((s) => s.id);
    console.log("[confirmNightOrderPreview] Setting wakeQueueIds:", wakeIds);
    console.log("[confirmNightOrderPreview] Setting gamePhase: firstNight");

    // 首先设置队列和索引
    dispatch(
      gameActions.updateState({
        wakeQueueIds: wakeIds,
        currentWakeIndex: 0,
        selectedActionTargets: [],
        inspectionResult: null,
      })
    );

    // 然后设置游戏阶段
    dispatch(gameActions.setGamePhase("firstNight"));

    // 清除模态框和待处理队列
    dispatch(gameActions.setModal(null));
    dispatch(gameActions.updateState({ pendingNightQueue: null }));

    console.log(
      "[confirmNightOrderPreview] ✅ Night started with queue:",
      wakeIds
    );
  }, [pendingNightQueue, dispatch, gamePhase]);

  const handleStartNight = useCallback(
    (isFirst: boolean) => {
      // 占卜师红罗剎重指派逻辑...
      dispatch(gameActions.setGamePhase(isFirst ? "firstNight" : "night"));
      if (!isFirst) {
        dispatch(gameActions.updateState({ nightCount: nightCount + 1 }));
      }
    },
    [nightCount, dispatch]
  );

  const proceedToFirstNight = useCallback(
    (rolesToUse?: Role[]) => {
      // 🛡️ Guard: If already in night phase, do NOT regenerate queue
      if (gamePhase === "firstNight" || gamePhase === "night") {
        console.warn(
          `[proceedToFirstNight] Already in ${gamePhase}, ignoring request.`
        );
        return;
      }

      const r = rolesToUse || globalRoles || [];
      // 酒鬼伪装身份检查
      const drunkMissingCharade = seats.find(
        (s) => s.role?.id === "drunk" && !s.charadeRole
      );
      if (drunkMissingCharade) {
        // 酒鬼的伪装身份只能从当前剧本中不在场的镇民中选择
        // 首先获取当前剧本的所有角色ID
        const currentScriptRoleIds = selectedScript?.roleIds || [];

        const availableCharades = r.filter(
          (role) =>
            role.type === "townsfolk" &&
            !role.hidden &&
            // 角色必须在当前剧本的角色列表中
            currentScriptRoleIds.includes(role.id) &&
            // 不能是已经在场的角色
            !seats.some((s) => s.role?.id === role.id)
        );

        dispatch(
          gameActions.setModal({
            type: "DRUNK_CHARADE_SELECT",
            data: {
              seatId: drunkMissingCharade.id,
              availableRoles: availableCharades,
              scriptId: selectedScript?.id || "default",
            },
          })
        );
        return;
      }

      // 调用 startNight 生成首夜队列并弹出预览
      // 注意：需要从外部传入 startNight 引用，因为 useGameFlow 不直接依赖 useNightLogic
      // 使用游戏事件总线触发 startNight 逻辑
      gameEventBus.emit("startFirstNight", {});
    },
    [seats, dispatch, gamePhase, selectedScript?.id, selectedScript?.name]
  );

  const tickTimer = useCallback(
    (delta: number) => {
      dispatch(gameActions.setTimer(Math.max(0, timer + delta)));
    },
    [timer, dispatch]
  );

  return useMemo(
    () => ({
      gamePhase,
      nightCount,
      timer,
      isTimerRunning,
      handleTimerPause,
      handleTimerStart,
      handleTimerReset,
      setGamePhase: (val: React.SetStateAction<GamePhase>) => {
        const next =
          typeof val === "function"
            ? (val as (p: GamePhase) => GamePhase)(state.gamePhase)
            : val;
        dispatch(gameActions.setGamePhase(next));
      },
      setNightCount: (val: React.SetStateAction<number>) => {
        const next =
          typeof val === "function"
            ? (val as (p: number) => number)(state.nightCount)
            : val;
        dispatch(gameActions.updateState({ nightCount: next }));
      },
      setTimer: (val: React.SetStateAction<number>) => {
        const next =
          typeof val === "function"
            ? (val as (p: number) => number)(state.timer)
            : val;
        dispatch(gameActions.setTimer(next));
      },
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
      confirmNightDeathReport,
      tickTimer,
    }),
    [
      gamePhase,
      nightCount,
      timer,
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
      confirmNightDeathReport,
      dispatch,
      state.gamePhase,
      state.nightCount,
      state.timer,
    ]
  );
}
