/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { Seat } from "../../app/data";
import { gameActions, useGameContext } from "../contexts/GameContext";
import type { NightInfoResult } from "../types/game";
import { isFortuneTellerTarget } from "../utils/gameRules";

/**
 * UseInteractionHandlerResult - 交互管理 Hook 的返回结果
 */
export interface UseInteractionHandlerResult {
  handleSeatClick: (seatId: number, options?: { force?: boolean }) => void;
  toggleTarget: (seatId: number) => void;
  confirmAction: () => void;
  cancelAction: () => void;
  isTargetDisabled: (seat: Seat) => boolean;
  handleConfirmAction: () => void;
  handleMenuAction: (action: string) => void;
  toggleStatus: (type: string, seatId?: number) => void;
}

/**
 * useInteractionHandler - 交互与行动管理 Hook
 * 现已重构为原生使用 GameContext
 */
export function useInteractionHandler(deps: {
  getRoleTargetCount: (
    roleId: string,
    isFirstNight: boolean
  ) => { min: number; max: number } | null;
  handleConfirmActionImpl?: (explicitSelectedTargets?: number[]) => void;
  nightInfo?: NightInfoResult | null;
  [key: string]: any;
}): UseInteractionHandlerResult {
  const { state, dispatch } = useGameContext();
  const {
    gamePhase,
    seats,
    selectedRole,
    wakeQueueIds,
    currentWakeIndex,
    selectedActionTargets,
    nightCount,
    contextMenu,
    currentModal,
    isVortoxWorld,
    nightActionQueue,
    deadThisNight,
  } = state;

  const {
    getRoleTargetCount,
    handleConfirmActionImpl,
    nightInfo: depsNightInfo,
    canSelectTarget,
  } = deps;

  // ... (toggleTarget and handleSeatClick unchanged) ...

  const toggleTarget = useCallback(
    (targetId: number) => {
      // 优先使用传入的 activeNightStep (nightInfo)，如果不存在则回退到队列系统
      const nightInfo = depsNightInfo || nightActionQueue[currentWakeIndex];
      if (!nightInfo) return;

      // 获取当前允许的最大目标数
      // 策略：优先从 meta.targetCount 读取，如果不存在则使用 getRoleTargetCount 回退，最后默认为 1
      let maxTargets = 1;

      // 1. 尝试从 meta 读取 (Transmission Layer fix)
      if ("meta" in nightInfo && nightInfo.meta?.targetCount) {
        maxTargets = nightInfo.meta.targetCount.max;
      } else {
        // 2. 回退到旧逻辑 (Definition Layer lookup)
        // 注意：这里 nightInfo 可能是 Seat 类型，也可能是 NightInfoResult 类型
        // Seat 类型有 role 属性, NightInfoResult 有 effectiveRole 属性
        const effectiveRole =
          "effectiveRole" in nightInfo
            ? nightInfo.effectiveRole
            : nightInfo.role?.id === "drunk"
              ? nightInfo.charadeRole
              : nightInfo.role;

        if (effectiveRole) {
          const isFirstNight = gamePhase === "firstNight";
          const targetCount = getRoleTargetCount(
            effectiveRole.id,
            isFirstNight
          );
          maxTargets = targetCount?.max ?? 1;
        }
      }

      console.log("[toggleTarget] Debug:", {
        hasMeta: "meta" in nightInfo,
        maxTargets,
        currentTargets: selectedActionTargets,
      });

      let newTargets = [...selectedActionTargets];
      // A. 如果点击了已选中的人 -> 取消选中
      if (newTargets.includes(targetId)) {
        newTargets = newTargets.filter((t) => t !== targetId);
      } else {
        // B. 如果还没选中
        if (maxTargets > 1) {
          if (newTargets.length < maxTargets) {
            // 还没满，直接添加
            newTargets.push(targetId);
          } else {
            // 满了，策略 B (轮替): 移除最早选的，加入新的
            newTargets.shift();
            newTargets.push(targetId);
          }
        } else {
          // 情况 2: 单选 (默认行为)
          newTargets = [targetId];
        }
      }

      dispatch(gameActions.setSelectedTargets(newTargets));
    },
    [
      nightActionQueue,
      currentWakeIndex,
      gamePhase,
      selectedActionTargets,
      dispatch,
      depsNightInfo,
      getRoleTargetCount,
    ]
  );

  const handleSeatClick = useCallback(
    (id: number, _options?: { force?: boolean }) => {
      // 1. Setup 阶段逻辑 (保持原样)
      if (gamePhase === "setup" || gamePhase === "scriptSelection") {
        if (selectedRole) {
          // 检查该角色是否已经入座
          const existingSeat = seats.find(
            (s) => s.role?.id === selectedRole.id
          );

          if (existingSeat) {
            // 如果点击的是同一个座位，则视为取消入座
            if (existingSeat.id === id) {
              dispatch(gameActions.updateSeat(id, { role: null }));
              return;
            }
            alert("该角色已入座");
            return;
          }
          dispatch(gameActions.updateSeat(id, { role: selectedRole }));
        } else {
          dispatch(gameActions.updateSeat(id, { role: null }));
        }
        return;
      }

      // 2. 🔥 核心修复：游戏进行中 (夜晚/白天) 的逻辑 (Adapted from user instruction) 🔥

      // 从当前步骤的数据中读取允许的数量
      // ADAPTATION: Use local dependencies instead of 'gameController' which is not in scope here
      const currentStep = depsNightInfo || nightActionQueue[currentWakeIndex];

      // 如果当前没有行动数据，或者不是选人环节，直接返回
      // ADAPTATION: Check 'interaction' object if present, fall back to role definition check if needed (but we added interaction object in step 1)
      // Note: 'interaction' property might be on the NightInfoResult now
      if (!currentStep) return;

      // Check if it has interaction data (we added this to nightLogic)
      const interaction = (currentStep as any).interaction;

      // Fallback if interaction object missing (e.g. for simple roles not yet updated or other logic paths)
      // But for 'choose_player' type roles, we rely on our new architecture.
      if (!interaction && gamePhase !== "day") {
        // Optional: Fallback to toggleTarget old logic if strictly needed, or just return.
        // User asked to "REPLACE" logic.
        // But wait, the previous toggleTarget had important logic?
        // Actually user said "replace logic for non-setup phases".
      }

      // Direct implementation of the queue strategy requested
      // ⭐ 动态获取最大目标数 (如果没定义，默认为 1)
      let maxTargets = 1;
      if (interaction?.amount) {
        maxTargets = interaction.amount;
      } else {
        // Fallback: Read from meta.targetCount if interaction obj not present (Defensive)
        if ("meta" in currentStep && currentStep.meta?.targetCount) {
          maxTargets = currentStep.meta.targetCount.max;
        }
      }

      // Update logic
      let newTargets = [...selectedActionTargets];

      // A. 如果点击了已选中的人 -> 取消选中
      if (newTargets.includes(id)) {
        newTargets = newTargets.filter((t) => t !== id);
      } else {
        // B. 如果点击了新的人
        // 策略：如果没满，直接加；如果满了，挤掉最早选的 (Queue模式)
        if (newTargets.length < maxTargets) {
          newTargets.push(id);
        } else {
          // "挤掉"逻辑：只保留最近选的 (maxTargets - 1) 个，然后加上新的
          if (maxTargets > 0) {
            const targetsToKeep = newTargets.slice(
              newTargets.length - maxTargets + 1
            );
            newTargets = [...targetsToKeep, id];
          } else {
            // maxTargets 0? Should not happen if we are selecting.
            newTargets = [id];
          }
        }
      }

      dispatch(gameActions.setSelectedTargets(newTargets));
    },
    [
      gamePhase,
      selectedRole,
      seats,
      dispatch,
      depsNightInfo,
      nightActionQueue,
      currentWakeIndex,
      selectedActionTargets,
    ]
  );

  const isTargetDisabled = useCallback(
    (targetSeat: Seat) => {
      const activeSeat = nightActionQueue[currentWakeIndex];
      if (!activeSeat) return false;

      const roleId =
        activeSeat.role?.id === "drunk"
          ? activeSeat.charadeRole?.id
          : activeSeat.role?.id;
      if (!roleId) return false;

      const isFirstNight = gamePhase === "firstNight";

      // We use the passed canSelectTarget logic from useRoleAction via deps
      if (canSelectTarget) {
        return !canSelectTarget(
          roleId,
          activeSeat.id,
          targetSeat.id,
          seats,
          selectedActionTargets,
          isFirstNight,
          gamePhase,
          deadThisNight
        );
      }

      return false;
    },
    [
      nightActionQueue,
      currentWakeIndex,
      gamePhase,
      seats,
      selectedActionTargets,
      deadThisNight,
      canSelectTarget,
    ]
  );

  // 交互式角色结果自动生成逻辑 (Interactive Role Result Generator)
  // 支持: 占卜师 (Fortune Teller), 裁缝 (Seamstress - Future), etc.
  useEffect(() => {
    // FIX: Use activeNightStep (deps.nightInfo) which has the computed logic, NOT the raw queue
    const nightInfo = depsNightInfo;
    if (!nightInfo) return;

    const effectiveRole = nightInfo.effectiveRole;
    if (!effectiveRole) return;
    const roleId = effectiveRole.id;

    // 🔮 占卜师 (Fortune Teller)
    if (roleId === "fortune_teller") {
      if (selectedActionTargets.length === 2) {
        const t1 = seats.find((s) => s.id === selectedActionTargets[0]);
        const t2 = seats.find((s) => s.id === selectedActionTargets[1]);
        if (t1 && t2) {
          const isFT1 = isFortuneTellerTarget(t1);
          const isFT2 = isFortuneTellerTarget(t2);
          const isEvil = isFT1 || isFT2;

          // 涡流环境判定
          const resultValue = isVortoxWorld ? !isEvil : isEvil;
          const resultText = resultValue ? "✅ 是" : "❌ 否";
          const targetOutput = `🔮 占卜师信息：${resultText}`;

          if (state.inspectionResult !== targetOutput) {
            dispatch(
              gameActions.updateState({
                inspectionResult: targetOutput,
                inspectionResultKey: Math.random(),
              })
            );
          }
        }
      }
    }

    // 🧵 裁缝 (Seamstress) - 示例扩展点
    // else if (roleId === 'seamstress') { ... }

    // 🧹 如果切换了角色或重置了选择，且当前没有结果需要显示，可以在这里清除
    // 但为了保持UI稳定，我们通常不自动清除，直到下一个行动覆盖它。
  }, [
    selectedActionTargets,
    seats,
    isVortoxWorld,
    state.inspectionResult,
    dispatch,
    depsNightInfo,
  ]);

  const handleConfirmAction = useCallback(() => {
    const nightInfo = depsNightInfo || nightActionQueue[currentWakeIndex];

    if (!nightInfo) return;

    // 如果当前有弹窗，且不是允许的操作类弹窗（例如夜序浏览），则阻止确认
    // CRITICAL FIX: Don't block if the modal is just informational (Review, Logs, Role Info, Night Order)
    if (currentModal) {
      const isNonBlockingModal =
        currentModal.type === "NIGHT_ORDER_PREVIEW" ||
        currentModal.type === "REVIEW" ||
        currentModal.type === "GAME_RECORDS" ||
        currentModal.type === "POISON_CONFIRM" ||
        currentModal.type === "POISON_EVIL_CONFIRM" ||
        currentModal.type === "ROLE_INFO";

      if (!isNonBlockingModal) {
        return;
      }
    }

    // 调用外部传入的确认逻辑（暂时保持，因为这涉及到复杂的角色能力处理器）
    if (handleConfirmActionImpl) {
      handleConfirmActionImpl(selectedActionTargets);
    } else {
      dispatch(gameActions.nextNightAction());
    }
  }, [
    nightActionQueue,
    currentWakeIndex,
    currentModal,
    dispatch,
    handleConfirmActionImpl,
    selectedActionTargets,
    depsNightInfo,
  ]);

  const handleMenuAction = useCallback(
    (action: string) => {
      const seatId = contextMenu?.seatId;
      if (seatId === undefined || seatId === null) return;

      dispatch(gameActions.updateState({ contextMenu: null }));

      if (action === "nominate") {
        dispatch(
          gameActions.setModal({
            type: "DAY_ACTION",
            data: { type: "nominate", sourceId: seatId },
          })
        );
      } else if (action === "slayer") {
        dispatch(
          gameActions.setModal({
            type: "DAY_ACTION",
            data: { type: "slayer", sourceId: seatId },
          })
        );
      }
    },
    [contextMenu, dispatch]
  );

  const toggleStatus = useCallback(
    (type: string, seatId?: number) => {
      const targetId = seatId ?? contextMenu?.seatId;
      if (targetId === undefined || targetId === null) return;

      const seat = seats.find((s) => s.id === targetId);
      if (!seat) return;

      if (type === "redherring") {
        // 占卜师天敌红罗刹：全局唯一，只有占卜师在场时才能设置
        const hasFortuneTeller = seats.some(
          (s) => s.role?.id === "fortune_teller" && !s.isDead
        );
        if (!hasFortuneTeller) {
          // 没有占卜师，不允许设置红罗刹
          dispatch(
            gameActions.addLog({
              day: 0,
              phase: "setup",
              message: "⚠️ 无法设置红罗刹：场上没有存活的占卜师。",
            })
          );
          dispatch(gameActions.updateState({ contextMenu: null }));
          return;
        }

        const isCurrentlyRedHerring = !!seat.isRedHerring;

        // 批量更新：清除所有人，然后给目标加上
        seats.forEach((s) => {
          if (s.isRedHerring || s.isFortuneTellerRedHerring) {
            dispatch(
              gameActions.updateSeat(s.id, {
                isRedHerring: false,
                isFortuneTellerRedHerring: false,
              })
            );
          }
        });

        if (!isCurrentlyRedHerring) {
          dispatch(
            gameActions.updateSeat(targetId, {
              isRedHerring: true,
              isFortuneTellerRedHerring: true,
            })
          );
        }
      } else {
        const updates: Partial<Seat> = {};
        if (type === "dead") updates.isDead = !seat.isDead;
        if (type === "poison") updates.isPoisoned = !seat.isPoisoned;
        if (type === "drunk") updates.isDrunk = !seat.isDrunk;
        dispatch(gameActions.updateSeat(targetId, updates));
      }

      dispatch(gameActions.updateState({ contextMenu: null }));
    },
    [contextMenu, seats, dispatch]
  );

  return useMemo(
    () => ({
      handleSeatClick,
      toggleTarget,
      confirmAction: handleConfirmAction,
      cancelAction: () => {},
      isTargetDisabled,
      handleConfirmAction,
      handleMenuAction,
      toggleStatus,
    }),
    [
      handleSeatClick,
      toggleTarget,
      handleConfirmAction,
      isTargetDisabled,
      handleMenuAction,
      toggleStatus,
    ]
  );
}
