/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo } from "react";
import type { GamePhase, Role, Seat } from "../../app/data";
import type { GameRecord, NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";

/**
 * 确认弹窗处理函数的依赖接口
 */
export interface ConfirmHandlersDeps {
  // State
  nightInfo: NightInfoResult | null;
  currentModal: ModalType;
  seats: Seat[];
  gamePhase: GamePhase;
  nightCount: number;
  currentWakeIndex: number;
  wakeQueueIds: number[];
  deadThisNight: number[];
  klutzChoiceTarget: number | null;
  hadesiaChoices: Record<number, "live" | "die">;
  currentHint: {
    isPoisoned: boolean;
    guide: string;
    speak: string;
    fakeInspectionResult?: string | null;
  };
  isVortoxWorld: boolean;
  gameLogs: any[];
  selectedScript: { name: string; id: string } | null;
  startTime: Date | null;
  timer: number;

  // Setters
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
  setKlutzChoiceTarget: React.Dispatch<React.SetStateAction<number | null>>;
  setHadesiaChoices: React.Dispatch<
    React.SetStateAction<Record<number, "live" | "die">>
  >;
  setInspectionResult: React.Dispatch<React.SetStateAction<string | null>>;
  setInspectionResultKey: React.Dispatch<React.SetStateAction<number>>;
  setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>>;
  setCurrentWakeIndex: React.Dispatch<React.SetStateAction<number>>;
  setWinResult: React.Dispatch<React.SetStateAction<any>>;
  setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;

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
  isEvil: (seat: Seat) => boolean;
  isActorDisabledByPoisonOrDrunk: (seat: Seat) => boolean;
  addDrunkMark: (
    seat: Seat,
    drunkType:
      | "sweetheart"
      | "goon"
      | "sailor"
      | "innkeeper"
      | "courtier"
      | "philosopher"
      | "minstrel",
    clearTime: string
  ) => { statusDetails: string[]; statuses: any[] };
  getDemonDisplayName: (roleId?: string, fallbackName?: string) => string;
  executePlayer: (
    id: number,
    options?: { skipLunaticRps?: boolean; forceExecution?: boolean }
  ) => void;
  saveGameRecord: (record: GameRecord) => void;

  // Sub-hook results
  nightLogic: {
    processDemonKill: (
      targetId: number,
      options?: any
    ) => "pending" | "resolved";
  };

  // Refs
  moonchildChainPendingRef: React.MutableRefObject<boolean>;
}

/**
 * useConfirmHandlers - 处理各种弹窗确认操作的 Hook
 * 从 useGameController 中提取的 Group A 函数
 */
export function useConfirmHandlers(deps: ConfirmHandlersDeps) {
  const {
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
    setSeats,
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
    moonchildChainPendingRef,
  } = deps;

  const confirmMayorRedirect = useCallback(
    (redirectTargetId: number | null) => {
      if (!nightInfo || currentModal?.type !== "MAYOR_REDIRECT") return;
      const mayorId = currentModal.data.targetId;
      const demonName = currentModal.data.demonName;

      setCurrentModal(null);

      if (redirectTargetId === null) {
        // 不转移市长自己死亡
        nightLogic.processDemonKill(mayorId, { skipMayorRedirectCheck: true });
        setCurrentModal(null);
        continueToNextAction();
        return;
      }

      const seatId = nightInfo?.seat?.id ?? 0;
      addLogWithDeduplication(
        `${seatId + 1}号(${demonName}) 攻击市长 ${mayorId + 1}号，死亡转移给${redirectTargetId + 1}号`,
        seatId,
        demonName
      );

      nightLogic.processDemonKill(redirectTargetId, {
        skipMayorRedirectCheck: true,
        mayorId,
      });
      setCurrentModal(null);
      if (moonchildChainPendingRef.current) return;
      continueToNextAction();
    },
    [
      nightInfo,
      currentModal,
      nightLogic,
      setCurrentModal,
      continueToNextAction,
      addLogWithDeduplication,
      moonchildChainPendingRef,
    ]
  );

  const confirmHadesiaKill = useCallback(() => {
    if (
      !nightInfo ||
      !currentModal ||
      currentModal.type !== "HADESIA_KILL_CONFIRM"
    )
      return;
    const targetIds = (currentModal.data as { targetIds: number[] }).targetIds;
    if (targetIds.length !== 3) return;

    const targetNames = targetIds.map((id: number) => `${id + 1}号`).join("、");
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(
      `${seatId + 1}号(哈迪寂亚) 选择${targetNames}，所有玩家都会得知这个选择`
    );
    addLog(`请说书人决定 ${targetNames} 的命运如果他们全部存活他们全部死亡`);

    setCurrentModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  }, [
    nightInfo,
    currentModal,
    setCurrentModal,
    setSelectedActionTargets,
    continueToNextAction,
    addLog,
  ]);

  const confirmMoonchildKill = useCallback(
    (targetId: number) => {
      if (currentModal?.type !== "MOONCHILD_KILL") return;
      const { sourceId, onResolve } = currentModal.data;
      setCurrentModal(null);

      const targetSeat = seats.find((s) => s.id === targetId);
      const isGood =
        targetSeat?.role &&
        ["townsfolk", "outsider"].includes(targetSeat.role.type);

      if (isGood) {
        addLog(
          `${sourceId + 1}号(月之子) 选择 ${targetId + 1}号与其陪葬，善良今晚死亡`
        );
        killPlayer(targetId, {
          onAfterKill: (latestSeats: Seat[]) => {
            onResolve?.(latestSeats);
            moonchildChainPendingRef.current = false;
            if (!moonchildChainPendingRef.current) {
              continueToNextAction();
            }
          },
        });
      } else {
        addLog(
          `${sourceId + 1}号(月之子) 选择 ${targetId + 1}号，但该目标非善良，未死亡`
        );
        moonchildChainPendingRef.current = false;
        onResolve?.();
        if (!moonchildChainPendingRef.current) {
          continueToNextAction();
        }
      }
    },
    [
      currentModal,
      seats,
      killPlayer,
      continueToNextAction,
      addLog,
      setCurrentModal,
      moonchildChainPendingRef,
    ]
  );

  const confirmSweetheartDrunk = useCallback(
    (targetId: number) => {
      if (currentModal?.type !== "SWEETHEART_DRUNK") return;
      const { sourceId, onResolve } = currentModal.data;
      setCurrentModal(null);

      setSeats((prev) =>
        prev.map((s) => {
          if (s.id !== targetId) return s;
          const clearTime = "次日黄昏";
          const { statusDetails, statuses } = addDrunkMark(
            s,
            "sweetheart",
            clearTime
          );
          return { ...s, isDrunk: true, statusDetails, statuses };
        })
      );
      addLog(
        `${sourceId + 1}号(心上人) 死亡使 ${targetId + 1}号今晚至次日黄昏醉酒`
      );

      onResolve?.();
      continueToNextAction();
    },
    [
      currentModal,
      setSeats,
      addDrunkMark,
      continueToNextAction,
      addLog,
      setCurrentModal,
    ]
  );

  const confirmKlutzChoice = useCallback(() => {
    if (currentModal?.type !== "KLUTZ_CHOICE") return;
    const { sourceId, onResolve } = currentModal.data;
    if (klutzChoiceTarget === null) {
      alert("请选择一名存活玩家");
      return;
    }
    const target = seats.find((s) => s.id === klutzChoiceTarget);
    if (!target || target.isDead) {
      alert("必须选择一名存活玩家");
      return;
    }
    setCurrentModal(null);
    setKlutzChoiceTarget(null);
    const seatsToUse = seats;
    const isEvilPick = isEvil(target);
    if (isEvilPick) {
      addLog(
        `${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，邪恶，善良阵营立即失败`
      );
      checkGameOver(seats, undefined, undefined, undefined, true);
      return;
    }
    addLog(`${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，非邪恶，无事发生`);
    if (onResolve) {
      onResolve(seatsToUse);
    } else {
      checkGameOver(seatsToUse);
    }
  }, [
    currentModal,
    klutzChoiceTarget,
    seats,
    isEvil,
    checkGameOver,
    setCurrentModal,
    setKlutzChoiceTarget,
    addLog,
  ]);

  const confirmStorytellerDeath = useCallback(
    (targetId: number | null) => {
      if (currentModal?.type !== "STORYTELLER_DEATH") return;
      const sourceId = currentModal.data.sourceId;
      setCurrentModal(null);

      if (targetId === null) {
        const confirmed = window.confirm(
          "你确认要让本晚无人死亡吗？这会让本局更偏离标准规则，只建议在你非常确定时使用"
        );
        if (!confirmed) return;
        addLog(
          `说书人选择本晚无人死亡，因${sourceId + 1}号变为新恶魔，这是一次偏离标准规则的特殊裁决`
        );
        continueToNextAction();
        return;
      }

      addLog(`说书人指定${targetId + 1}号当晚死亡，因${sourceId + 1}号变恶魔`);
      killPlayer(targetId, {
        onAfterKill: () => {
          continueToNextAction();
        },
      });
    },
    [currentModal, killPlayer, continueToNextAction, addLog, setCurrentModal]
  );

  const confirmHadesia = useCallback(() => {
    if (
      !nightInfo ||
      !currentModal ||
      currentModal.type !== "HADESIA_KILL_CONFIRM"
    )
      return;
    const baseTargets = (currentModal.data as { targetIds: number[] })
      .targetIds;
    const demonName = getDemonDisplayName(
      nightInfo.effectiveRole.id,
      nightInfo.effectiveRole.name
    );
    const choiceMap = baseTargets.reduce<Record<number, "live" | "die">>(
      (acc: Record<number, "live" | "die">, id: number) => {
        acc[id] = hadesiaChoices[id] || "live";
        return acc;
      },
      {}
    );

    const allChooseLive = baseTargets.every(
      (id: number) => choiceMap[id] === "live"
    );
    const finalTargets = allChooseLive
      ? baseTargets
      : baseTargets.filter((id: number) => choiceMap[id] === "die");

    const choiceDesc = baseTargets
      .map(
        (id: number) => `[${id + 1}号${choiceMap[id] === "die" ? "死" : "生"}]`
      )
      .join("、");
    addLog(`${nightInfo.seat.id + 1}号(${demonName}) 选择${choiceDesc}`);
    if (allChooseLive) {
      addLog(`三名玩家都选择"生"，按规则三人全部死亡`);
    } else if (finalTargets.length > 0) {
      addLog(
        `选择"生"的玩家${finalTargets.map((x: number) => `${x + 1}号`).join("、")}将立即死亡`
      );
    } else {
      addLog('未选择"生"的玩家，未触发死亡');
    }

    const currentWakeIdx = currentWakeIndex;

    setCurrentModal(null);
    setSelectedActionTargets([]);
    setHadesiaChoices({});

    if (finalTargets.length > 0) {
      let remaining = finalTargets.length;
      finalTargets.forEach((tid: number) => {
        killPlayer(tid, {
          onAfterKill: (latestSeats: Seat[]) => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(
                `${nightInfo?.seat.id + 1 || ""}号(${demonName}) 处决${finalTargets.map((x: number) => `${x + 1}号`).join("、")}`
              );
              setTimeout(() => {
                setWakeQueueIds((prevQueue) => {
                  const filteredQueue = prevQueue.filter((id) => {
                    const seat = latestSeats?.find((s) => s.id === id);
                    return seat && !seat.isDead;
                  });

                  if (
                    currentWakeIdx >= filteredQueue.length - 1 ||
                    filteredQueue.length === 0
                  ) {
                    setCurrentWakeIndex(0);
                    setTimeout(() => {
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
                    }, 50);
                    return [];
                  } else {
                    setTimeout(() => continueToNextAction(), 50);
                    return filteredQueue;
                  }
                });
              }, 100);
            }
          },
        });
      });
    } else {
      continueToNextAction();
    }
  }, [
    currentModal?.type,
    hadesiaChoices,
    addLog,
    setHadesiaChoices,
    setCurrentModal,
    killPlayer,
    nightInfo,
    currentWakeIndex,
    deadThisNight,
    continueToNextAction,
    getDemonDisplayName,
    setSelectedActionTargets,
    setWakeQueueIds,
    setCurrentWakeIndex,
  ]);

  const confirmSaintExecution = useCallback(() => {
    if (!currentModal || currentModal.type !== "SAINT_EXECUTION_CONFIRM")
      return;
    const { targetId } = currentModal.data;
    setCurrentModal(null);
    executePlayer(targetId, { forceExecution: true });
  }, [currentModal, setCurrentModal, executePlayer]);

  const cancelSaintExecution = useCallback(() => {
    setCurrentModal(null);
  }, [setCurrentModal]);

  const confirmRavenkeeperFake = useCallback(
    (r: Role) => {
      if (currentModal?.type !== "RAVENKEEPER_FAKE" || !nightInfo) return;
      const targetId = currentModal.data.targetId;
      if (targetId !== null && nightInfo) {
        const resultText = `${targetId + 1}号玩家的真实身份：${r.name}${currentHint.isPoisoned || isVortoxWorld ? " (中毒/醉酒状态，此为假信息)" : ""}`;
        setInspectionResult(resultText);
        setInspectionResultKey((k) => k + 1);
        addLogWithDeduplication(
          `${nightInfo.seat.id + 1}号(守鸦人) 查验 ${targetId + 1}号 -> 伪 ${r.name}`,
          nightInfo.seat.id,
          "守鸦人"
        );
      }
      setCurrentModal(null);
    },
    [
      currentModal,
      nightInfo,
      currentHint,
      isVortoxWorld,
      setInspectionResult,
      setInspectionResultKey,
      addLogWithDeduplication,
      setCurrentModal,
    ]
  );

  const confirmVirginTrigger = useCallback(() => {
    if (currentModal?.type !== "VIRGIN_TRIGGER") return;
    const { source, target } = currentModal.data;
    if (
      target.role?.id === "virgin" &&
      !target.hasBeenNominated &&
      !isActorDisabledByPoisonOrDrunk(target)
    ) {
      setSeats((p) => {
        const newSeats = p.map((s) =>
          s.id === source.id
            ? { ...s, isDead: true }
            : s.id === target.id
              ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true }
              : s
        );
        addLog(`${source.id + 1}号提名贞洁者被处决`);
        checkGameOver(newSeats);
        return newSeats;
      });
      setCurrentModal(null);
    } else {
      setCurrentModal(null);
    }
  }, [
    currentModal,
    checkGameOver,
    setSeats,
    addLog,
    setCurrentModal,
    isActorDisabledByPoisonOrDrunk,
  ]);

  const confirmRestart = useCallback(() => {
    if (gamePhase !== "scriptSelection" && selectedScript) {
      const updatedLogs = [
        ...gameLogs,
        { day: nightCount, phase: gamePhase, message: "说书人重开了游戏" },
      ];

      const endTime = new Date();
      const duration = startTime
        ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
        : timer;

      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime
          ? startTime.toISOString()
          : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: null,
        winReason: "说书人重开了游戏",
        seats: JSON.parse(JSON.stringify(seats)),
        gameLogs: updatedLogs,
      };

      saveGameRecord(record);
    }

    window.location.reload();
  }, [
    gamePhase,
    selectedScript,
    gameLogs,
    nightCount,
    startTime,
    timer,
    seats,
    saveGameRecord,
  ]);

  return useMemo(
    () => ({
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
    }),
    [
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
    ]
  );
}
