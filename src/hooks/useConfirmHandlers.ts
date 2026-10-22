/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { resolveKlutzOutcome } from "../utils/klutzRule";
import { buildDawnAnnouncement } from "../utils/dawnAnnouncement";
import { resolveHadesiaOutcome } from "../utils/hadesiaRule";
import { useCallback, useMemo } from "react";
import type { GamePhase, Role, Seat } from "../../app/data";
import type { GameRecord, NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";
import { showAlert, showConfirm } from "../utils/nativeDialogShim";
import { useGameContext } from "../contexts/GameContext";

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
  addLog: (msg: string | { message: string; summary?: string }) => void;
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
  /**
   * 「本局已终局」的唯一权威标记（`useLogicDispatcher` 持有）。
   * 任何直接判胜负的路径都必须置位，否则终局会被后续流程覆盖
   * （镇长路径 2026-10-21、圣徒路径 2026-10-22 都栽在这）。
   */
  victoryRef: React.MutableRefObject<{
    winner: "good" | "evil";
    reason: string;
  } | null>;
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
  // 旅行者接线：需要派发 GameContext 的 action（替罪羊代刑 / 枪手射击）
  const { dispatch } = useGameContext() as unknown as {
    dispatch: (action: any) => void;
  };
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
    victoryRef,
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
        // 不转移镇长自己死亡
        nightLogic.processDemonKill(mayorId, { skipMayorRedirectCheck: true });
        setCurrentModal(null);
        continueToNextAction();
        return;
      }

      const seatId = nightInfo?.seat?.id ?? 0;
      addLogWithDeduplication(
        `${seatId + 1}号(${demonName}) 攻击镇长 ${mayorId + 1}号，死亡转移给${redirectTargetId + 1}号`,
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
          `${sourceId + 1}号(月之子) 公开选择 ${targetId + 1}号；若其为善良，该玩家在当晚死亡`
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
      showAlert("请选择一名存活玩家");
      return;
    }
    const target = seats.find((s) => s.id === klutzChoiceTarget);
    if (!target || target.isDead) {
      showAlert("必须选择一名存活玩家");
      return;
    }
    setCurrentModal(null);
    setKlutzChoiceTarget(null);
    const seatsToUse = seats;

    /**
     * ⚠️ 2026-10-21：判据抽到 `utils/klutzRule::resolveKlutzOutcome`（可单测）。
     *
     * 官方措辞是「如果他是邪恶的，**你的阵营**落败」，原实现把落败方**写死**成
     * 「善良阵营立即失败」—— 呆瓜是外来者（善良）时恰好等价，
     * 但呆瓜被转为邪恶（`isEvilConverted`）时就会**判反**。
     */
    const klutzSeat = seatsToUse.find((s) => s.id === sourceId);
    const outcome = resolveKlutzOutcome(klutzSeat as any, target as any);

    if (!outcome.gameOver) {
      addLog(
        `${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，${outcome.reason}`
      );
      if (onResolve) {
        onResolve(seatsToUse);
      } else {
        checkGameOver(seatsToUse);
      }
      return;
    }

    if (outcome.losingAlignment === "evil") {
      // 呆瓜自身已被转为邪恶 ⇒ 选中邪恶时落败的是**邪恶**阵营（官方「你的阵营」）
      addLog(
        `${sourceId + 1}号(呆瓜) 选择${target.id + 1}号（邪恶）；呆瓜属邪恶阵营 ⇒ 邪恶阵营落败，善良获胜`
      );
      setWinResult("good");
      setGamePhase("gameOver");
      return;
    }

    addLog(
      `${sourceId + 1}号(呆瓜) 选择${target.id + 1}号（邪恶）⇒ 善良阵营落败`
    );
    checkGameOver(seats, undefined, undefined, undefined, true);
  }, [
    currentModal,
    klutzChoiceTarget,
    seats,
    isEvil,
    checkGameOver,
    setCurrentModal,
    setKlutzChoiceTarget,
    addLog,
    setWinResult,
    setGamePhase,
  ]);

  const confirmStorytellerDeath = useCallback(
    (targetId: number | null) => {
      if (currentModal?.type !== "STORYTELLER_DEATH") return;
      const sourceId = currentModal.data.sourceId;
      setCurrentModal(null);

      if (targetId === null) {
        showConfirm({
          title: "特殊裁决",
          message:
            "你确认要让本晚无人死亡吗？这会让本局更偏离标准规则，只建议在你非常确定时使用",
          onConfirm: () => {
            addLog(
              `说书人选择本晚无人死亡，因${sourceId + 1}号变为新恶魔，这是一次偏离标准规则的特殊裁决`
            );
            continueToNextAction();
          },
        });
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

    /**
     * 生死结算收口到纯函数（`utils/hadesiaRule`）：
     * 官方【运作方式】有两个方向 —— 黄昏存活但黎明死亡 ⇒ 死；
     * 黄昏死亡但黎明存活 ⇒ **复活**。此前只做了「死」，复活半边缺失。
     */
    const outcome = resolveHadesiaOutcome(
      baseTargets,
      choiceMap,
      (seatId: number) => Boolean(seats.find((s: Seat) => s.id === seatId)?.isDead)
    );
    const allChooseLive = outcome.allLive;
    const finalTargets = outcome.killIds;

    const choiceDesc = baseTargets
      .map(
        (id: number) => `[${id + 1}号${choiceMap[id] === "die" ? "死" : "生"}]`
      )
      .join("、");
    addLog(`${nightInfo.seat ? nightInfo.seat.id + 1 : "?"}号(${demonName}) 选择${choiceDesc}`);
    if (allChooseLive) {
      addLog(`三名玩家都选择"生"，按规则三人全部死亡`);
    } else if (finalTargets.length > 0) {
      addLog(
        `选择"死"的玩家${finalTargets.map((x: number) => `${x + 1}号`).join("、")}将立即死亡`
      );
    } else {
      addLog('未选择"生"的玩家，未触发死亡');
    }

    const currentWakeIdx = currentWakeIndex;

    /**
     * 🌅 哈迪寂亚的「复活」半边（官方【运作方式】原文）：
     *   「宣布黄昏时存活但黎明时死亡的玩家死亡，
     *     宣布黄昏时死亡但黎明时存活的玩家复活。」
     *
     * 缺陷（2026-10-22）：此前只实现了「死」——选「生」的**已死玩家**永远复活不了。
     * 判据：选「生」且**当前**已死。
     * ⚠️ 三人都选「生」时按规则三人**全部死亡**，不存在复活（否则会自相矛盾）。
     * 复活与死亡的目标集合天然互斥（live / die），因此不需要回滚。
     */
    const revivedIds = outcome.reviveIds;

    setCurrentModal(null);
    setSelectedActionTargets([]);
    setHadesiaChoices({});

    if (revivedIds.length > 0) {
      addLog(
        `黄昏时已死亡的${revivedIds.map((x: number) => `${x + 1}号`).join("、")}选择"生"，黎明时复活`
      );
      // 只做纯座位变换（不在 updater 内做副作用 —— 见 `seatsRef` 那条铁律）
      setSeats((prev: Seat[]) =>
        prev.map((s: Seat) =>
          revivedIds.includes(s.id)
            ? {
                ...s,
                isDead: false,
                markedForDeath: false,
                diedAtNight: undefined,
                diedOnDay: undefined,
                killedBy: undefined,
                deathSource: undefined,
                deathSourceSeatId: undefined,
                revivedAtNight: nightCount,
                statusEffects: [
                  ...((s as any).statusEffects ?? []),
                  { type: "resurrected", source: "al_hadikhia" },
                ],
              }
            : s
        )
      );
    }

    if (finalTargets.length > 0) {
      let remaining = finalTargets.length;
      finalTargets.forEach((tid: number) => {
        killPlayer(tid, {
          onAfterKill: (latestSeats: Seat[]) => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(
                `${(nightInfo?.seat?.id ?? -1) + 1 || ""}号(${demonName}) 处决${finalTargets.map((x: number) => `${x + 1}号`).join("、")}`
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
                      setCurrentModal({
                        type: "NIGHT_DEATH_REPORT",
                        data: {
                          message: buildDawnAnnouncement({
                            deadThisNight,
                            revivedThisNight: revivedIds,
                          }),
                        },
                      });
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
    currentModal,
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
    // 「生 ⇒ 复活」判据依赖当前座位与当前夜
    seats,
    setSeats,
    nightCount,
  ]);

  /**
   * 哈迪寂亚生/死抉择「取消」（2026-10-20 修复 P1）。
   * 官方交互无取消概念；等价于「三人全部选死」⇒ 无人死亡。
   * ⚠️ 必须推进夜队列（continueToNextAction）——原 onCancel 只关弹窗不推进 ⇒ 夜序卡死。
   */
  const cancelHadesia = useCallback(() => {
    if (currentModal?.type !== "HADESIA_KILL_CONFIRM") {
      setCurrentModal(null);
      return;
    }
    addLog("哈迪寂亚的生/死抉择已取消，本次未触发死亡");
    setCurrentModal(null);
    setSelectedActionTargets([]);
    setHadesiaChoices({});
    continueToNextAction();
  }, [
    currentModal,
    addLog,
    setCurrentModal,
    setSelectedActionTargets,
    setHadesiaChoices,
    continueToNextAction,
  ]);

  const confirmSaintExecution = useCallback(() => {
    if (!currentModal || currentModal.type !== "SAINT_EXECUTION_CONFIRM")
      return;
    const { targetId, saintIsEvil } = currentModal.data;
    setCurrentModal(null);
    /**
     * 🔴 2026-10-22（X02 文案对账查出）：原先**写死** `setWinResult("evil")`，
     *   而官方原文是「如果你死于处决，**你的阵营**落败」
     *   （范例原话：「如果一名**邪恶的圣徒**被处决，**善良阵营获胜**」）。
     *   ⇒ 圣徒被转化后方向会写反。
     *   同时补 `victoryRef` —— 它是「本局已终局」的唯一权威标记，
     *   只改相位/胜方而不置位，会出现与镇长路径同型的「终局被后续流程覆盖」。
     */
    // 这里只是把**已确定的阵营结论**转成胜负标签，不含阵营判定
    // sst-exempt-alignment-label
    const winner: "good" | "evil" = saintIsEvil ? "good" : "evil"; // sst-exempt-alignment-label
    addLog(
      `${targetId + 1}号(圣徒) 被处决，其阵营（${saintIsEvil ? "邪恶" : "善良"}）落败 ⇒ ${
        winner === "good" ? "善良" : "邪恶"
      }阵营获胜`
    );
    victoryRef.current = { winner, reason: "圣徒被处决" };
    setWinResult(winner);
    setWinReason("圣徒被处决");
    executePlayer(targetId, { forceExecution: true });
  }, [
    currentModal,
    setCurrentModal,
    executePlayer,
    addLog,
    setWinResult,
    setWinReason,
  ]);

  const cancelSaintExecution = useCallback(() => {
    setCurrentModal(null);
  }, [setCurrentModal]);

  /**
   * 🐑 旅行者 · 替罪羊：说书人裁定「代刑」。
   * 官方原文：「如果你的阵营的一名玩家被处决，你可能会代替他被处决。」
   * 写入 `travelerHookChoices.scapegoatSubstituteForId` 后重走处决流程，
   * `executePlayer` 内的代刑分支会读到该裁定（判据见 utils/travelerHooks.ts）。
   */
  const confirmScapegoatSubstitute = useCallback(() => {
    if (!currentModal || currentModal.type !== "TRAVELER_SCAPEGOAT_CHOICE")
      return;
    const { targetId } = currentModal.data;
    setCurrentModal(null);
    dispatch({ type: "SET_SCAPEGOAT_SUBSTITUTE", targetId });
    addLog(`🐑 说书人裁定：旅行者替罪羊为${targetId + 1}号代为受刑`);
    executePlayer(targetId);
  }, [currentModal, setCurrentModal, dispatch, executePlayer, addLog]);

  /** 替罪羊：说书人裁定「不代刑」⇒ 正常处决（零回归路径） */
  const cancelScapegoatSubstitute = useCallback(() => {
    if (!currentModal || currentModal.type !== "TRAVELER_SCAPEGOAT_CHOICE")
      return;
    const { targetId } = currentModal.data;
    setCurrentModal(null);
    addLog(`⚖️ 说书人裁定：${targetId + 1}号正常被处决（替罪羊不代刑）`);
    executePlayer(targetId);
  }, [currentModal, setCurrentModal, executePlayer, addLog]);

  /**
   * 🔫 旅行者 · 枪手：说书人从「刚投过票」名单中选射击目标。
   * 官方原文：「每个白天，当首次投票被统计后，你可以选择一名刚投过票的玩家：他死亡。」
   * 目标合法性由 reducer 的纯函数判据把关（travelerGunslingerCanShoot）。
   */
  const fireGunslinger = useCallback(
    (targetId: number) => {
      if (!currentModal || currentModal.type !== "TRAVELER_GUNSLINGER_CHOICE")
        return;
      const { night } = currentModal.data;
      setCurrentModal(null);
      dispatch({ type: "FIRE_GUNSLINGER", targetId, night });
      addLog(`🔫 枪手射击：${targetId + 1}号（刚投过票）立即死亡`);
      killPlayer(targetId, { source: "execution", recordNightDeath: false });
    },
    [currentModal, setCurrentModal, dispatch, killPlayer, addLog]
  );

  /** 枪手：说书人放弃射击 ⇒ 关窗（当天不再开窗） */
  const cancelGunslingerFire = useCallback(() => {
    setCurrentModal(null);
    addLog(`🔫 枪手未在本次白天射击`);
  }, [setCurrentModal, addLog]);

  const confirmEvilTwinExecution = useCallback(() => {
    if (!currentModal || currentModal.type !== "EVIL_TWIN_EXECUTION_CONFIRM")
      return;
    const { targetId } = currentModal.data;
    setCurrentModal(null);
    addLog(`👥 ${targetId + 1}号(善良双子) 被处决，镜像双子能力生效，邪恶阵营直接获胜！`);
    setWinResult("evil");
    setWinReason("善良双子被处决（镜像双子胜利）");
    executePlayer(targetId, { forceExecution: true });
  }, [
    currentModal,
    setCurrentModal,
    executePlayer,
    addLog,
    setWinResult,
    setWinReason,
  ]);

  const cancelEvilTwinExecution = useCallback(() => {
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
          `${nightInfo.seat ? nightInfo.seat.id + 1 : "?"}号(守鸦人) 查验 ${targetId + 1}号 -> 伪 ${r.name}`,
          nightInfo.seat?.id ?? -1,
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
    }),
    [
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
    ]
  );
}
