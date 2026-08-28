/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { Seat } from "../../app/data";
import { roles } from "../../app/data";
import { gameActions, useGameContext } from "../contexts/GameContext";
import type { NightInfoResult } from "../types/game";

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
  saveHistory?: () => void;
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
    saveHistory,
  } = deps;

  // ... (toggleTarget and handleSeatClick unchanged) ...

  const isTargetDisabled = useCallback(
    (targetSeat: Seat) => {
      const activeSeat =
        depsNightInfo?.seat || nightActionQueue[currentWakeIndex];
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
      depsNightInfo,
      nightActionQueue,
      currentWakeIndex,
      gamePhase,
      seats,
      selectedActionTargets,
      deadThisNight,
      canSelectTarget,
    ]
  );

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
        const targetSeat = seats.find((s) => s.id === targetId);
        if (targetSeat && isTargetDisabled(targetSeat)) {
          console.warn(
            `[toggleTarget] 目标 ${targetId + 1}号 不可被选择（规则限制）`
          );
          return;
        }
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
      seats,
      isTargetDisabled,
    ]
  );

  const handleSeatClick = useCallback(
    (id: number, _options?: { force?: boolean }) => {
      // 1. Setup 阶段逻辑：直接点击已有角色的座位直接取消落座；空座位在有选定角色时落座，无选定角色时无事发生
      if (gamePhase === "setup" || gamePhase === "scriptSelection") {
        const targetSeat = seats.find((s) => s.id === id);

        // 如果座位上已经有角色，直接取消落座并将座位空出来
        if (targetSeat?.role) {
          const removedRoleName = targetSeat.role.name;
          dispatch(
            gameActions.updateSeat(id, {
              role: null,
              displayRole: null,
              charadeRole: null,
            })
          );
          dispatch(gameActions.setSelectedRole(null));
          if (gamePhase === "setup") {
            dispatch(
              gameActions.addLog({
                day: 0,
                phase: "setup",
                message: `取消落座：${id + 1}号 - ${removedRoleName}`,
              })
            );
          }
          return;
        }

        // 座位上没有人（空座位）
        if (selectedRole) {
          // 检查该角色是否已经在其他座位入座（若有且非允许多人入座的角色如军团/暴乱，则转移角色，清空旧座位）
          const allowsMultiple =
            selectedRole.id === "legion" || selectedRole.id === "riot";
          if (!allowsMultiple) {
            const existingSeat = seats.find(
              (s) => s.role?.id === selectedRole.id
            );
            if (existingSeat && existingSeat.id !== id) {
              dispatch(
                gameActions.updateSeat(existingSeat.id, {
                  role: null,
                  displayRole: null,
                  charadeRole: null,
                })
              );
            }
          }

          // 将选中的角色落座到该空座位
          dispatch(
            gameActions.updateSeat(id, {
              role: selectedRole,
              displayRole: selectedRole,
              charadeRole: null,
            })
          );
          dispatch(gameActions.setSelectedRole(null));
          if (gamePhase === "setup") {
            dispatch(
              gameActions.addLog({
                day: 0,
                phase: "setup",
                message: `落座：${id + 1}号 - ${selectedRole.name}`,
              })
            );
          }
        }
        // 如果点击空座位且没有选中角色，则无事发生
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
        // 防御性回退：若该步骤没有 interaction 但需要选目标（nightInfo.targetLimit.min>=1），
        // 直接 return 会导致座位点击无效、确认按钮永久禁用、夜晚死锁。
        // 这里改回退到 toggleTarget 选择逻辑，由 nightInfo.meta.targetCount 或角色定义推导目标数。
        console.log(
          "[handleSeatClick] interaction 缺失，回退 toggleTarget 选择逻辑"
        );
        toggleTarget(id);
        return;
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
        // 校验目标是否被禁用
        const targetSeat = seats.find((s) => s.id === id);
        if (targetSeat && isTargetDisabled(targetSeat)) {
          console.warn(
            `[handleSeatClick] 目标 ${id + 1}号 不可被选择（规则限制）`
          );
          return;
        }

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
      toggleTarget,
      isTargetDisabled,
    ]
  );

  // 占卜师结果不再在选人阶段自动写入控制台：
  // 结果由确认后的 FORTUNE_TELLER_RESULT 弹窗展示，避免随机注册导致闪烁。
  useEffect(() => {
    const nightInfo = depsNightInfo;
    const isFortuneTeller = nightInfo?.effectiveRole?.id === "fortune_teller";
    if (
      !isFortuneTeller &&
      state.inspectionResult?.startsWith("🔮 占卜师信息")
    ) {
      dispatch(
        gameActions.updateState({
          inspectionResult: null,
        })
      );
    }
  }, [depsNightInfo, state.inspectionResult, dispatch]);

  const handleConfirmAction = useCallback(async () => {
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
        currentModal.type === "ROLE_INFO" ||
        currentModal.type === "NIGHT_ACTION_CONFIRM" ||
        currentModal.type === "INFO_RESULT" ||
        currentModal.type === "KILL_CONFIRM";

      if (!isNonBlockingModal) {
        return;
      }
    }

    // 调用外部传入的确认逻辑（暂时保持，因为这涉及到复杂的角色能力处理器）
    if (handleConfirmActionImpl) {
      await handleConfirmActionImpl(selectedActionTargets);
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
      } else if (action === "charade") {
        // 酒鬼与提线木偶设置伪装身份（仅在 setup / check 阶段允许）
        if (state.gamePhase !== "setup" && state.gamePhase !== "check") return;
        const targetSeat = seats.find((s) => s.id === seatId);
        if (
          !targetSeat ||
          (targetSeat.role?.id !== "drunk" &&
            targetSeat.role?.id !== "marionette")
        )
          return;
        const { selectedScript } = state;
        const currentScriptRoleIds = selectedScript?.roleIds || [];
        const seenIds = new Set<string>();
        const currentScriptRoles = roles.filter((role) => {
          if (!currentScriptRoleIds.includes(role.id)) return false;
          if (seenIds.has(role.id)) return false;
          seenIds.add(role.id);
          return true;
        });
        const charadesFiltered = currentScriptRoles.filter(
          (role) =>
            role.type === "townsfolk" &&
            !role.hidden &&
            !seats.some((s) => s.role?.id === role.id) &&
            !seats.some((s) => s.id !== seatId && s.charadeRole?.id === role.id)
        );
        // 🔧 修复：若所有镇民角色都已在场（如角色池镇民不足的高配比局），
        // 过滤结果为空会导致弹窗无角色可选、确认按钮永久禁用（玩家死局）。
        // 此时回退为剧本全部镇民可选——官方规则允许酒鬼伪装任意镇民角色（可包含在场同名角色）。
        const availableCharades =
          charadesFiltered.length > 0
            ? charadesFiltered
            : currentScriptRoles.filter(
                (role) => role.type === "townsfolk" && !role.hidden
              );
        dispatch(
          gameActions.setModal({
            type: "DRUNK_CHARADE_SELECT",
            data: {
              seatId,
              availableRoles: availableCharades,
              scriptId: selectedScript?.id || "default",
            },
          })
        );
      } else if (action === "reminder_tokens") {
        // 打开提醒标记面板
        dispatch(
          gameActions.setModal({
            type: "REMINDER_TOKENS",
            data: { seatId },
          })
        );
      }
    },
    [contextMenu, dispatch, seats, state]
  );

  const toggleStatus = useCallback(
    (type: string, seatId?: number) => {
      const targetId = seatId ?? contextMenu?.seatId;
      if (targetId === undefined || targetId === null) return;

      // 保存历史快照用于撤销
      if (saveHistory) saveHistory();

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
      } else if (type === "good_twin") {
        // 镜像双子对立目标：全局唯一，只有镜像双子在场时才能设置
        const evilTwinSeat = seats.find((s) => s.role?.id === "evil_twin");
        if (!evilTwinSeat) {
          dispatch(
            gameActions.addLog({
              day: state.nightCount || 0,
              phase: state.gamePhase,
              message: "⚠️ 无法设置对立双子：场上没有镜像双子。",
            })
          );
          dispatch(gameActions.updateState({ contextMenu: null }));
          return;
        }

        const isCurrentlyGoodTwin =
          !!seat.isGoodTwin || state.evilTwinPair?.goodId === targetId;

        // 批量更新：清除所有人对立双子标记
        seats.forEach((s) => {
          if (s.isGoodTwin) {
            dispatch(gameActions.updateSeat(s.id, { isGoodTwin: false }));
          }
        });

        if (!isCurrentlyGoodTwin) {
          dispatch(gameActions.updateSeat(targetId, { isGoodTwin: true }));
          dispatch(
            gameActions.updateState({
              evilTwinPair: {
                evilId: evilTwinSeat.id,
                goodId: targetId,
              },
              contextMenu: null,
            })
          );
          dispatch(
            gameActions.addLog({
              day: state.nightCount || 0,
              phase: state.gamePhase,
              message: `👥 说书人已指定 ${targetId + 1}号【${seat.role?.name || "未知角色"}】为镜像双子的对立善良双子。`,
            })
          );
        } else {
          dispatch(
            gameActions.updateState({
              evilTwinPair: null,
              contextMenu: null,
            })
          );
          dispatch(
            gameActions.addLog({
              day: state.nightCount || 0,
              phase: state.gamePhase,
              message: `👥 说书人已取消 ${targetId + 1}号的对立双子身份。`,
            })
          );
        }
      } else if (type === "charade") {
        // 酒鬼伪装身份设置：弹出 DRUNK_CHARADE_SELECT 模态框
        const { selectedScript } = state;
        const currentScriptRoleIds = selectedScript?.roleIds || [];
        const seenIds = new Set<string>();
        const currentScriptRoles = roles.filter((role) => {
          if (!currentScriptRoleIds.includes(role.id)) return false;
          if (seenIds.has(role.id)) return false;
          seenIds.add(role.id);
          return true;
        });

        const availableCharades = currentScriptRoles.filter(
          (role) =>
            role.type === "townsfolk" &&
            !role.hidden &&
            // 不能是已经在场的角色，且不能是其他酒鬼/提线木偶已选的伪装角色
            !seats.some((s) => s.role?.id === role.id) &&
            !seats.some(
              (s) => s.id !== targetId && s.charadeRole?.id === role.id
            )
        );

        dispatch(
          gameActions.setModal({
            type: "DRUNK_CHARADE_SELECT",
            data: {
              seatId: targetId,
              availableRoles: availableCharades,
              scriptId: selectedScript?.id || "default",
            },
          })
        );
      } else if (type === "mutant_reveal") {
        // 畸形秀演员暴露标记：说书人判定"疯狂地证明自己是外来者"
        const isRevealed = !!(seat as any).mutantRevealed;
        dispatch(
          gameActions.updateSeat(targetId, {
            mutantRevealed: !isRevealed,
          } as any)
        );
        dispatch(
          gameActions.addLog({
            day: state.nightCount || 0,
            phase: state.gamePhase,
            message: isRevealed
              ? `🦂 说书人已取消 ${targetId + 1}号的畸形秀演员"已暴露"标记。`
              : `🦂 说书人判定 ${targetId + 1}号【畸形秀演员】疯狂地证明了外来者身份 → 已暴露（可立即处决）。`,
          })
        );
      } else if (type === "pixie_madness") {
        // 小精灵"疯狂证明"状态切换
        const seatAny = seat as any;
        const isMad = !!seatAny.pixieMadnessConfirmed;
        dispatch(
          gameActions.updateSeat(targetId, {
            pixieMadnessConfirmed: !isMad,
          } as any)
        );
        dispatch(
          gameActions.addLog({
            day: state.nightCount || 0,
            phase: state.gamePhase,
            message: isMad
              ? `🎭 已取消 ${targetId + 1}号【小精灵】的"疯狂证明"状态。`
              : `🎭 说书人判定 ${targetId + 1}号【小精灵】足够疯狂地证明了角色身份。`,
          })
        );
      } else if (type === "cerenovus_execute") {
        // 洗脑师：被洗脑玩家不够疯狂 → 立即处决
        const madnessDetail = (seat.statusDetails ?? []).find((st) =>
          st.startsWith("洗脑疯狂:")
        );
        dispatch(gameActions.updateSeat(targetId, { isDead: true }));
        dispatch(
          gameActions.addLog({
            day: state.nightCount || 0,
            phase: state.gamePhase,
            message: `🧠 ${targetId + 1}号因未能疯狂扮演【${madnessDetail?.replace("洗脑疯狂:", "") ?? "指定角色"}】，被说书人立即处决！`,
          })
        );
      } else if (type === "lunatic_apparent_demon") {
        // 疯子：循环切换 apparentDemonRole 到下一个恶魔角色
        const allDemons = roles.filter((r: any) => r.type === "demon");
        const currentId = (seat as any).apparentDemonRole?.id;
        const idx = allDemons.findIndex((r: any) => r.id === currentId);
        const nextDemon =
          allDemons[(idx + 1) % allDemons.length] ?? allDemons[0];
        dispatch(
          gameActions.updateSeat(targetId, {
            apparentDemonRole: nextDemon,
          } as any)
        );
        dispatch(
          gameActions.addLog({
            day: state.nightCount || 0,
            phase: state.gamePhase,
            message: `🎭 说书人已为 ${targetId + 1}号【疯子】重新分配假恶魔身份：${nextDemon.name}（${nextDemon.id}）`,
          })
        );
      } else {
        const updates: Partial<Seat> = {};
        if (type === "dead") updates.isDead = !seat.isDead;
        if (type === "poison") updates.isPoisoned = !seat.isPoisoned;
        if (type === "drunk") updates.isDrunk = !seat.isDrunk;
        dispatch(gameActions.updateSeat(targetId, updates));
      }

      dispatch(gameActions.updateState({ contextMenu: null }));
    },
    [contextMenu, seats, dispatch, state, saveHistory]
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
