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
  setCurrentModal: (m: any) => void
) {
  const wakeIndexRef = useRef(0);
  // 🔧 修复：记录首夜 index 0 是否已显示（避免小恶魔被跳过）
  const hasShownIndexZeroRef = useRef(false);
  const [activeNightStep, setActiveNightStep] =
    useState<NightInfoResult | null>(null);
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  const updateSnapshot = useCallback(
    (index: number, currentSeats: Seat[], currentPhase: string) => {
      // 🔧 标记 index 0 已显示
      if (index === 0) hasShownIndexZeroRef.current = true;
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
      const currentIndex = wakeIndexRef.current;
      // 🔧 修复：若 index 0 尚未显示且队列非空，先显示 index 0 而不是跳到 1。
      //   场景：首夜进入后没人调用 updateSnapshot(0)，玩家直接点"确认"，
      //   导致首夜第一个角色（小恶魔等）被跳过。
      if (!hasShownIndexZeroRef.current && wakeQueueIds.length > 0) {
        console.log(
          "[continueToNextAction] 首夜 index 0 未显示，先显示第一个角色"
        );
        hasShownIndexZeroRef.current = true;
        wakeIndexRef.current = 0;
        setCurrentWakeIndex(0);
        updateSnapshot(0, latestSeats ?? seats, gamePhase);
        return;
      }
      const nextIndex = currentIndex + 1;
      const queueLength = wakeQueueIds.length;

      console.log(
        "[continueToNextAction] currentIndex:",
        currentIndex,
        "nextIndex:",
        nextIndex,
        "queueLength:",
        queueLength
      );
      console.log("[continueToNextAction] wakeQueueIds:", wakeQueueIds);

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
      updateSnapshot(nextIndex, latestSeats ?? seats, gamePhase);
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
        updateSnapshot(0, seats, gamePhase);
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
