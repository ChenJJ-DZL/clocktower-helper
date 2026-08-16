import { useCallback, useEffect, useRef, useState } from "react";
import type { Script, Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";
import { calculateNightInfoViaNewEngine } from "../utils/nightInfoAdapter";

export function useNightSnapshot(
  seats: Seat[],
  selectedScript: Script | null,
  gamePhase: string,
  setGamePhase: (p: any) => void,
  nightCount: number,
  systemStepRoleIds: Map<number, string>,
  lastDuskExecution: number | null,
  isEvilWithJudgment: (s: Seat) => boolean,
  poppyGrowerDead: boolean,
  spyDisguiseMode: "off" | "default" | "on",
  spyDisguiseProbability: number,
  deadThisNight: number[],
  balloonistKnownTypes: Record<number, string[]>,
  registrationCache: Map<string, any>,
  isVortoxWorld: boolean,
  todayDemonVoted: boolean,
  todayMinionNominated: boolean,
  todayExecutedId: number | null,
  hasUsedAbility: (roleId: string, seatId: number) => boolean,
  votedThisRound: number[],
  outsiderDiedToday: boolean,
  wakeQueueIds: number[],
  setCurrentWakeIndex: (idx: number) => void,
  addLog: (msg: string) => void,
  setCurrentModal: (m: any) => void,
  wakeQueueIdsRef?: React.MutableRefObject<number[]>,
  // 🔧 跨角色状态时序统一机制：useGameController 的 seatsRef（commitSeats
  //   同步镜像的最新座位）。任何 handler setSeats/commitSeats 改状态后，
  //   无参 continueToNextAction 生成下一步 guide 时优先读它——保证
  //   "角色 A 行动改角色 B 状态 → 角色 B 行动时实时感知"（全角色覆盖）。
  externalLatestSeatsRef?: React.MutableRefObject<Seat[]>
) {
  const wakeIndexRef = useRef(0);
  // 🔧 修复：记录首夜 index 0 是否已显示（避免小恶魔被跳过）
  const hasShownIndexZeroRef = useRef(false);
  const [activeNightStep, setActiveNightStep] =
    useState<NightInfoResult | null>(null);
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());
  // 🔧 跨角色状态时序修复：记录"最新一次"的座位快照。
  //   nightInfo 生成（guide/speak）必须基于"行动当下的座位状态"——
  //   若上一步角色（如投毒者）刚给某玩家下毒，其毒必须反映在下一步
  //   行动者的信息生成中。此前多处 continueToNextAction() 无参调用 /
  //   effect 用 React 闭包 seats，存在"毒已同步但生成仍用旧座位"的
  //   时序窗口 → 被毒角色信息显示真实信息（用户报告的核心 bug）。
  //   统一兜底：生成时优先取显式传入的最新座位，其次取本 ref。
  const latestSeatsRef = useRef<Seat[]>(seats);

  const updateSnapshot = useCallback(
    (index: number, currentSeats: Seat[], currentPhase: string) => {
      // 🔧 守鸦人修复：读 ref 最新队列（动态插入的守鸦人节点）
      const latestQueue = wakeQueueIdsRef?.current ?? wakeQueueIds;
      // 🔧 跨角色状态时序修复：每次生成都更新"最新座位"引用，
      //   保证后续任何生成路径（含无参 continueToNextAction / effect）
      //   都基于最新座位（含上一步下毒/击杀同步的状态）。
      //   注意：currentSeats 来自 React 已提交状态或 executeViaNewEngine
      //   的 syncedSeats，均为权威最新；effect 触发时 React 已 commit，
      //   闭包 seats 亦为最新（React 保证 effect 在 commit 后执行）。
      if (currentSeats && currentSeats.length > 0) {
        latestSeatsRef.current = currentSeats;
      }
      const safeSeats =
        currentSeats && currentSeats.length > 0
          ? currentSeats
          : externalLatestSeatsRef?.current && externalLatestSeatsRef.current.length > 0
            ? externalLatestSeatsRef.current
            : latestSeatsRef.current;
      // 🔧 标记 index 0 已显示
      if (index === 0) hasShownIndexZeroRef.current = true;
      const nextSeatId = latestQueue[index];
      if (nextSeatId !== undefined) {
        const systemRoleId = systemStepRoleIds.get(nextSeatId) || undefined;
        const nextStepInfo = calculateNightInfoViaNewEngine(
          selectedScript,
          safeSeats,
          nextSeatId,
          currentPhase as any,
          lastDuskExecution,
          nightCount,
          systemRoleId,
          undefined,
          drunkFirstInfoRef.current,
          isEvilWithJudgment,
          poppyGrowerDead,
          [],
          spyDisguiseMode,
          spyDisguiseProbability,
          deadThisNight,
          balloonistKnownTypes,
          registrationCache,
          `${currentPhase}-${nightCount}`,
          isVortoxWorld,
          todayDemonVoted,
          todayMinionNominated,
          todayExecutedId,
          hasUsedAbility,
          votedThisRound,
          outsiderDiedToday
        );
        setActiveNightStep(nextStepInfo);
        return nextStepInfo;
      }
      return null;
    },
    [
      wakeQueueIds,
      selectedScript,
      lastDuskExecution,
      nightCount,
      isEvilWithJudgment,
      poppyGrowerDead,
      spyDisguiseMode,
      spyDisguiseProbability,
      deadThisNight,
      balloonistKnownTypes,
      registrationCache,
      isVortoxWorld,
      todayDemonVoted,
      todayMinionNominated,
      todayExecutedId,
      hasUsedAbility,
      votedThisRound,
      outsiderDiedToday,
    ]
  );

  const refreshSnapshot = useCallback(
    (currentSeats: Seat[], currentPhase: string) => {
      const index = wakeIndexRef.current;
      const nextSeatId = wakeQueueIds[index];
      if (nextSeatId !== undefined) {
        const systemRoleId = systemStepRoleIds.get(nextSeatId) || undefined;
        const nextStepInfo = calculateNightInfoViaNewEngine(
          selectedScript,
          currentSeats,
          nextSeatId,
          currentPhase as any,
          lastDuskExecution,
          nightCount,
          systemRoleId,
          undefined,
          drunkFirstInfoRef.current,
          isEvilWithJudgment,
          poppyGrowerDead,
          [],
          spyDisguiseMode,
          spyDisguiseProbability,
          deadThisNight,
          balloonistKnownTypes,
          registrationCache,
          `${currentPhase}-${nightCount}`,
          isVortoxWorld,
          todayDemonVoted,
          todayMinionNominated,
          todayExecutedId,
          hasUsedAbility,
          votedThisRound,
          outsiderDiedToday
        );
        setActiveNightStep(nextStepInfo);
        return nextStepInfo;
      }
      return null;
    },
    [
      wakeQueueIds,
      selectedScript,
      lastDuskExecution,
      nightCount,
      isEvilWithJudgment,
      poppyGrowerDead,
      spyDisguiseMode,
      spyDisguiseProbability,
      deadThisNight,
      balloonistKnownTypes,
      registrationCache,
      isVortoxWorld,
      todayDemonVoted,
      todayMinionNominated,
      todayExecutedId,
      hasUsedAbility,
      votedThisRound,
      outsiderDiedToday,
    ]
  );

  const continueToNextAction = useCallback(
    (latestSeats?: Seat[]) => {
      // 🔧 守鸦人修复：用 ref 读取最新 wakeQueueIds（动态插入的守鸦人节点
      //   通过 setWakeQueueIds 函数式更新 + 同步写 ref，闭包中的 wakeQueueIds
      //   在同一次执行流内是旧值，会导致插入的节点被跳过）
      const latestQueue = wakeQueueIdsRef?.current ?? wakeQueueIds;
      const currentIndex = wakeIndexRef.current;
      // 🔧 修复：若 index 0 尚未显示且队列非空，先显示 index 0 而不是跳到 1。
      //   场景：首夜进入后没人调用 updateSnapshot(0)，玩家直接点"确认"，
      //   导致首夜第一个角色（小恶魔等）被跳过。
      if (!hasShownIndexZeroRef.current && latestQueue.length > 0) {
        console.log(
          "[continueToNextAction] 首夜 index 0 未显示，先显示第一个角色"
        );
        hasShownIndexZeroRef.current = true;
        wakeIndexRef.current = 0;
        setCurrentWakeIndex(0);
        updateSnapshot(
          0,
          latestSeats ??
            (externalLatestSeatsRef?.current && externalLatestSeatsRef.current.length > 0
              ? externalLatestSeatsRef.current
              : seats),
          gamePhase
        );
        return;
      }
      const nextIndex = currentIndex + 1;
      const queueLength = latestQueue.length;

      console.log(
        "[continueToNextAction] currentIndex:",
        currentIndex,
        "nextIndex:",
        nextIndex,
        "queueLength:",
        queueLength
      );
      console.log("[continueToNextAction] wakeQueueIds:", latestQueue);

      if (nextIndex >= queueLength) {
        // 夜晚结束，重置索引
        console.log("[continueToNextAction] Night ended, resetting index");
        wakeIndexRef.current = 0;
        hasShownIndexZeroRef.current = false;
        setCurrentWakeIndex(0);
        setActiveNightStep(null);

        // 设置游戏阶段为黎明报告
        console.log("[continueToNextAction] Setting gamePhase to dawnReport");
        // Bug Fix: 重置今日处决标记，否则 dawnReport→day 会跳过黄昏处决
        setGamePhase("dawnReport");

        // 设置夜晚死亡报告模态框
        if (deadThisNight.length > 0) {
          const deadNames = deadThisNight.map((id) => `${id + 1}号`).join("、");
          console.log(
            "[continueToNextAction] Setting NIGHT_DEATH_REPORT modal for deaths:",
            deadNames
          );
          setCurrentModal({
            type: "NIGHT_DEATH_REPORT",
            data: { message: `昨晚${deadNames}玩家死亡` },
          });
        } else {
          console.log(
            "[continueToNextAction] Setting NIGHT_DEATH_REPORT modal for peaceful night"
          );
          setCurrentModal({
            type: "NIGHT_DEATH_REPORT",
            data: { message: "昨天是个平安夜" },
          });
        }
        return;
      }

      console.log("[continueToNextAction] Moving to next index:", nextIndex);
      wakeIndexRef.current = nextIndex;
      setCurrentWakeIndex(nextIndex);
      // 🔧 跨角色状态时序修复：显式传入的最新座位（executeViaNewEngine 的
      //   syncedSeats，含上一步下毒/击杀同步状态）更新 latestSeatsRef，
      //   供后续无参 continueToNextAction / effect / 安全网兜底使用。
      if (latestSeats && latestSeats.length > 0) {
        latestSeatsRef.current = latestSeats;
      }
      updateSnapshot(
        nextIndex,
        latestSeats ??
          (externalLatestSeatsRef?.current && externalLatestSeatsRef.current.length > 0
            ? externalLatestSeatsRef.current
            : latestSeatsRef.current) ??
          seats,
        gamePhase
      );
    },
    [
      wakeQueueIds,
      seats,
      gamePhase,
      updateSnapshot,
      setCurrentWakeIndex,
      deadThisNight,
      setCurrentModal,
      setGamePhase,
    ]
  );

  // Handle side-effect logging
  useEffect(() => {
    if (activeNightStep?.logMessage) {
      addLog(activeNightStep.logMessage);
    }
  }, [activeNightStep, addLog]);

  // 🔧 修复：首夜/夜间队列更新后，若 index 0 尚未显示（wakeIndexRef 仍为 0 且
  //   activeNightStep 为空），自动刷新 index 0 —— 否则首夜第一个角色（小恶魔等）
  //   被跳过（confirmNightOrderPreview 设置队列后，没人显示 index 0）。
  useEffect(() => {
    if (
      wakeQueueIds.length > 0 &&
      wakeIndexRef.current === 0 &&
      !activeNightStep
    ) {
      const t = setTimeout(() => {
        updateSnapshot(0, latestSeatsRef.current ?? seats, gamePhase);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [wakeQueueIds, activeNightStep, gamePhase, seats, updateSnapshot]);

  return {
    wakeIndexRef,
    activeNightStep,
    setActiveNightStep,
    drunkFirstInfoRef,
    continueToNextAction,
    updateSnapshot,
    refreshSnapshot,
  };
}
