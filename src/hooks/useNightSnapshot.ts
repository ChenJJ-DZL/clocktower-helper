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
  const [activeNightStep, setActiveNightStep] =
    useState<NightInfoResult | null>(null);
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  const updateSnapshot = useCallback(
    (index: number, currentSeats: Seat[], currentPhase: string) => {
      const nextSeatId = wakeQueueIds[index];
      if (nextSeatId !== undefined) {
        const nextStepInfo = calculateNightInfoViaNewEngine(
          selectedScript,
          currentSeats,
          nextSeatId,
          currentPhase as any,
          lastDuskExecution,
          nightCount,
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

  const continueToNextAction = useCallback(() => {
    const currentIndex = wakeIndexRef.current;
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
      setCurrentWakeIndex(0);
      setActiveNightStep(null);

      // 设置游戏阶段为黎明报告
      console.log("[continueToNextAction] Setting gamePhase to dawnReport");
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
    updateSnapshot(nextIndex, seats, gamePhase);
  }, [
    wakeQueueIds,
    seats,
    gamePhase,
    updateSnapshot,
    setCurrentWakeIndex,
    deadThisNight,
    setCurrentModal,
    setGamePhase,
  ]);

  // Handle side-effect logging
  useEffect(() => {
    if (activeNightStep?.logMessage) {
      addLog(activeNightStep.logMessage);
    }
  }, [activeNightStep, addLog]);

  return {
    wakeIndexRef,
    activeNightStep,
    setActiveNightStep,
    drunkFirstInfoRef,
    continueToNextAction,
    updateSnapshot,
  };
}
