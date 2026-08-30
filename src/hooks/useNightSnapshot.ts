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
  currentWakeIndex: number,
  setCurrentWakeIndex: (idx: number) => void,
  addLog: (msg: string) => void,
  setCurrentModal: (m: any) => void,
  wakeQueueIdsRef?: React.MutableRefObject<number[]>,
  // 🔧 跨角色状态时序统一机制：useGameController 的 seatsRef（commitSeats
  //   同步镜像的最新座位）。任何 handler setSeats/commitSeats 改状态后，
  //   无参 continueToNextAction 生成下一步 guide 时优先读它——保证
  //   "角色 A 行动改角色 B 状态 → 角色 B 行动时实时感知"（全角色覆盖）。
  externalLatestSeatsRef?: React.MutableRefObject<Seat[]>,
  systemStepRoleIdsRef?: React.MutableRefObject<Map<number, string>>,
  saveHistory?: (override?: any) => void
) {
  const wakeIndexRef = useRef(0);
  // 🔧 修复：记录首夜 index 0 是否已显示（避免小恶魔被跳过）
  const hasShownIndexZeroRef = useRef(false);
  const [activeNightStep, setActiveNightStep] =
    useState<NightInfoResult | null>(null);
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());
  // 🔧 跨角色状态时序修复：记录"最新一次"的座位快照。
  const latestSeatsRef = useRef<Seat[]>(seats);
  useEffect(() => {
    if (seats && seats.length > 0) {
      latestSeatsRef.current = seats;
    }
  }, [seats]);

  const updateSnapshot = useCallback(
    (index: number, currentSeats: Seat[], currentPhase: string) => {
      // 🔧 读 ref 最新队列（含动态插入的节点）
      const latestQueue = wakeQueueIdsRef?.current ?? wakeQueueIds;
      if (currentSeats && currentSeats.length > 0) {
        latestSeatsRef.current = currentSeats;
      }
      // 优先使用 commitSeats 同步镜像中的最新座位：上一步角色改状态后，
      // 下一步行动者也能立即读到最新中毒/醉酒/死亡/阵营变化。
      const safeSeats =
        externalLatestSeatsRef?.current &&
        externalLatestSeatsRef.current.length > 0
          ? externalLatestSeatsRef.current
          : currentSeats && currentSeats.length > 0
            ? currentSeats
            : latestSeatsRef.current;
      // 🔧 标记 index 0 已显示
      if (index === 0) hasShownIndexZeroRef.current = true;
      const nextSeatId = latestQueue[index];
      if (nextSeatId !== undefined) {
        const stepMap =
          systemStepRoleIdsRef?.current && systemStepRoleIdsRef.current.size > 0
            ? systemStepRoleIdsRef.current
            : systemStepRoleIds;
        const systemRoleId = stepMap.get(index) || undefined;
        console.log(
          `[NightSnapshot] 行动前实时状态检测并生成信息 -> index=${index}, seatId=${nextSeatId}, systemRoleId=${systemRoleId || "none"}`
        );
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
      wakeQueueIdsRef,
      externalLatestSeatsRef,
      selectedScript,
      systemStepRoleIds,
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
      systemStepRoleIdsRef?.current,
    ]
  );

  const refreshSnapshot = useCallback(
    (currentSeats: Seat[], currentPhase: string) => {
      const index = wakeIndexRef.current;
      const latestQueue = wakeQueueIdsRef?.current ?? wakeQueueIds;
      const nextSeatId = latestQueue[index];
      if (currentSeats && currentSeats.length > 0) {
        latestSeatsRef.current = currentSeats;
      }
      const safeSeats =
        externalLatestSeatsRef?.current &&
        externalLatestSeatsRef.current.length > 0
          ? externalLatestSeatsRef.current
          : currentSeats && currentSeats.length > 0
            ? currentSeats
            : latestSeatsRef.current;
      if (nextSeatId !== undefined) {
        const stepMap =
          systemStepRoleIdsRef?.current && systemStepRoleIdsRef.current.size > 0
            ? systemStepRoleIdsRef.current
            : systemStepRoleIds;
        const systemRoleId = stepMap.get(index) || undefined;
        console.log(
          `[NightSnapshot] 手动刷新行动前实时状态 -> index=${index}, seatId=${nextSeatId}, systemRoleId=${systemRoleId || "none"}`
        );
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
      wakeQueueIdsRef,
      externalLatestSeatsRef,
      selectedScript,
      systemStepRoleIds,
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
      systemStepRoleIdsRef?.current,
    ]
  );

  const continueToNextAction = useCallback(
    (latestSeats?: Seat[]) => {
      const currentIndex = wakeIndexRef.current;
      // 🔧 守鸦人修复：用 ref 读取最新 wakeQueueIds（动态插入的守鸦人节点
      //   通过 setWakeQueueIds 函数式更新 + 同步写 ref，闭包中的 wakeQueueIds
      //   在同一次执行流内是旧值，会导致插入的节点被跳过）
      const latestQueue = wakeQueueIdsRef?.current ?? wakeQueueIds;
      const currentSeats =
        latestSeats ??
        (externalLatestSeatsRef?.current &&
        externalLatestSeatsRef.current.length > 0
          ? externalLatestSeatsRef.current
          : latestSeatsRef.current) ??
        seats;

      // 🔧 修复：若 index 0 尚未显示且队列非空，先定位第一个有效行动角色
      if (!hasShownIndexZeroRef.current && latestQueue.length > 0) {
        const stepMap =
          systemStepRoleIdsRef?.current && systemStepRoleIdsRef.current.size > 0
            ? systemStepRoleIdsRef.current
            : systemStepRoleIds;
        let firstValidIndex = 0;
        while (firstValidIndex < latestQueue.length) {
          const isSystemStep = stepMap.has(firstValidIndex);
          if (isSystemStep) break;
          const candidateSeatId = latestQueue[firstValidIndex];
          const candidateSeat = currentSeats.find(
            (s) => s.id === candidateSeatId
          );
          if (!candidateSeat) {
            firstValidIndex++;
            continue;
          }
          const isDead =
            candidateSeat.isDead || (candidateSeat as any).isAlive === false;
          if (!isDead) break;
          const roleId = candidateSeat.role?.id;
          const canActWhileDead =
            candidateSeat.hasAbilityEvenDead ||
            (roleId === "ravenkeeper" &&
              deadThisNight.includes(candidateSeatId)) ||
            (roleId === "sage" && deadThisNight.includes(candidateSeatId));
          if (canActWhileDead) break;
          firstValidIndex++;
        }

        if (firstValidIndex >= latestQueue.length) {
          // 全部角色均无效，直接进入黎明报告
          wakeIndexRef.current = latestQueue.length;
          hasShownIndexZeroRef.current = false;
          setCurrentWakeIndex(latestQueue.length);
          setActiveNightStep(null);
          setGamePhase("dawnReport");
          if (deadThisNight.length > 0) {
            const deadNames = deadThisNight
              .map((id) => `${id + 1}号`)
              .join("、");
            setCurrentModal({
              type: "NIGHT_DEATH_REPORT",
              data: { message: `昨晚${deadNames}玩家死亡` },
            });
          } else {
            setCurrentModal({
              type: "NIGHT_DEATH_REPORT",
              data: { message: "昨天是个平安夜" },
            });
          }
          return;
        }

        console.log(
          "[continueToNextAction] 首夜 index 0 未显示，先显示第一个有效角色:",
          firstValidIndex
        );
        hasShownIndexZeroRef.current = true;
        wakeIndexRef.current = firstValidIndex;
        setCurrentWakeIndex(firstValidIndex);
        updateSnapshot(firstValidIndex, currentSeats, gamePhase);
        return;
      }

      const rawNextIndex = currentIndex + 1;
      const queueLength = latestQueue.length;

      // 🔧 动态过滤死者（官方规则结算时序）：
      //   恶魔当晚杀人后，被杀角色立即死亡。若行动顺序在恶魔之后，因已死亡且无死后技能，
      //   当晚直接跳过；若在恶魔之前则已正常执行。
      const activeStepMap =
        systemStepRoleIdsRef?.current && systemStepRoleIdsRef.current.size > 0
          ? systemStepRoleIdsRef.current
          : systemStepRoleIds;
      let nextIndex = rawNextIndex;
      while (nextIndex < queueLength) {
        const isSystemStep = activeStepMap.has(nextIndex);
        if (isSystemStep) {
          // 系统步骤（如爪牙互认、恶魔互认）正常执行
          break;
        }

        const candidateSeatId = latestQueue[nextIndex];
        const candidateSeat = currentSeats.find(
          (s) => s.id === candidateSeatId
        );
        if (!candidateSeat) {
          nextIndex++;
          continue;
        }

        const isDead =
          candidateSeat.isDead || (candidateSeat as any).isAlive === false;
        if (!isDead) {
          // 存活玩家正常行动
          break;
        }

        // 已死亡玩家：检测是否具有死后行动能力或当晚死亡唤醒（守鸦人、贤者、hasAbilityEvenDead）
        const roleId = candidateSeat.role?.id;
        const canActWhileDead =
          candidateSeat.hasAbilityEvenDead ||
          (roleId === "ravenkeeper" &&
            deadThisNight.includes(candidateSeatId)) ||
          (roleId === "sage" && deadThisNight.includes(candidateSeatId));

        if (canActWhileDead) {
          break;
        }

        console.log(
          `[continueToNextAction] 跳过当晚已死亡且无死后能力的玩家: ${candidateSeatId + 1}号 (${candidateSeat.role?.name || "未知"})`
        );
        nextIndex++;
      }

      console.log(
        "[continueToNextAction] currentIndex:",
        currentIndex,
        "nextIndex (after dead filter):",
        nextIndex,
        "queueLength:",
        queueLength
      );
      console.log("[continueToNextAction] wakeQueueIds:", latestQueue);

      if (nextIndex >= queueLength) {
        // 夜晚结束，设置索引为队列长度，防止被安全网误判为首夜初始并重置为0
        console.log(
          "[continueToNextAction] Night ended, transitioning to dawnReport"
        );
        wakeIndexRef.current = queueLength;
        hasShownIndexZeroRef.current = false;
        setCurrentWakeIndex(queueLength);
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
        saveHistory?.({
          gamePhase: "dawnReport",
          currentWakeIndex: 0,
          ...(latestSeats && latestSeats.length > 0
            ? { seats: latestSeats }
            : {}),
        });
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
          (externalLatestSeatsRef?.current &&
          externalLatestSeatsRef.current.length > 0
            ? externalLatestSeatsRef.current
            : latestSeatsRef.current) ??
          seats,
        gamePhase
      );
      // 保存单步历史快照用于精准单步撤销与重做（记录下一个行动角色的 wakeIndex 与最新座位）
      saveHistory?.({
        currentWakeIndex: nextIndex,
        ...(latestSeats && latestSeats.length > 0
          ? { seats: latestSeats }
          : {}),
      });
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
      externalLatestSeatsRef?.current,
      systemStepRoleIds,
      systemStepRoleIdsRef?.current,
      wakeQueueIdsRef?.current,
      saveHistory,
    ]
  );

  // 监听外部 currentWakeIndex 变化（包括 Undo/Redo 撤销与重做时状态精准回退与前进）
  const lastSnapshotIdxRef = useRef<number | null>(null);
  const lastSnapshotPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    wakeIndexRef.current = currentWakeIndex;
    const isNight = gamePhase === "firstNight" || gamePhase === "night";
    if (
      isNight &&
      wakeQueueIds.length > 0 &&
      currentWakeIndex >= 0 &&
      currentWakeIndex < wakeQueueIds.length
    ) {
      const idxChanged = lastSnapshotIdxRef.current !== currentWakeIndex;
      const phaseChanged = lastSnapshotPhaseRef.current !== gamePhase;
      if (idxChanged || phaseChanged) {
        lastSnapshotIdxRef.current = currentWakeIndex;
        lastSnapshotPhaseRef.current = gamePhase;
        updateSnapshot(
          currentWakeIndex,
          externalLatestSeatsRef?.current ?? seats,
          gamePhase
        );
      }
    } else {
      lastSnapshotIdxRef.current = null;
      lastSnapshotPhaseRef.current = null;
    }
  }, [
    currentWakeIndex,
    gamePhase,
    wakeQueueIds,
    seats,
    updateSnapshot,
    externalLatestSeatsRef,
  ]);

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
    const isNight = gamePhase === "firstNight" || gamePhase === "night";
    if (
      isNight &&
      wakeQueueIds.length > 0 &&
      wakeIndexRef.current === 0 &&
      !hasShownIndexZeroRef.current &&
      !activeNightStep
    ) {
      const t = setTimeout(() => {
        if (!hasShownIndexZeroRef.current) {
          updateSnapshot(0, latestSeatsRef.current ?? seats, gamePhase);
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, [wakeQueueIds, activeNightStep, gamePhase, seats, updateSnapshot]);

  return {
    wakeIndexRef,
    hasShownIndexZeroRef,
    activeNightStep,
    setActiveNightStep,
    drunkFirstInfoRef,
    continueToNextAction,
    updateSnapshot,
    refreshSnapshot,
  };
}
