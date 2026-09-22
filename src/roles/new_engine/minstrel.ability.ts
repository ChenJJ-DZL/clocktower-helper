/**
 * 吟游诗人（Minstrel）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { isDrunkOrPoisoned } from "../../utils/bmrMechanics";

// 前置校验：吟游诗人的能力在爪牙被处决时触发
const preCheckOnExecution = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isExecutionTrigger: true } };
};

// 计算结果：检查被处决的是否是爪牙
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;

  // 获取吟游诗人座位
  const minstrelSeatId = context.actionNode.seatId;

  // 获取被处决的玩家
  const executedSeatId = storytellerInput?.executedSeatId;
  const executedSeat = snapshot.seats.find((s) => s.id === executedSeatId);

  if (!executedSeat) {
    return { ...context, aborted: true, abortReason: "未找到被处决的座位" };
  }

  // 检查被处决的是否是爪牙
  const isMinionExecuted =
    (executedSeat.role?.type ?? (executedSeat as any).roleType) === "minion";

  const result = {
    minstrelSeatId,
    executedSeatId,
    executedRole: executedSeat.role?.id ?? (executedSeat as any).roleId,
    isMinionExecuted,
    shouldDrunkEveryone: isMinionExecuted,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果爪牙被处决，则标记所有人（除吟游诗人和旅行者）醉酒
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  /**
   * ⚠️⚠️ 2026-09-21 修复【醉酒/中毒失效门控缺失】：
   * 官方核心规则：醉酒或中毒的玩家**失去其能力**（说书人只装作其仍有能力、走过场执行）。
   * 吟游诗人：`当一名爪牙死于处决时，除了你和旅行者以外的所有其他玩家醉酒直到明天黄昏。`
   *   官方明文：「如果一名爪牙玩家在吟游诗人**醉酒或中毒期间**死于处决时，吟游诗人的能力**不会触发**。」
   * 🔴 原实现：本文件全篇**无任何**有效性判定，而 `stateUpdate` 在
   *   `src/utils/middlewarePipeline.ts:91` 被**无条件**执行 ⇒ 醉酒/中毒的吟游诗人依然令效果落地。
   * ✅ 修法：状态落地前用 SST `isDrunkOrPoisoned`（→ `utils/seatDisabled::isSeatDisabled`，
   *   已覆盖 `statusEffects` / `statuses` / 中文 `statusDetails`）判定；受干扰时**只记选择、不写状态**。
   */
  {
    const _seats = (context.snapshot.seats ?? []) as any[];
    const _actor = _seats.find((s: any) => s.id === ((context.meta.abilityResult as any)?.minstrelSeatId));
    if (isDrunkOrPoisoned(_actor, _seats)) {
      return {
        ...context,
        meta: {
          ...context.meta,
          abilityResult: { ...(context.meta.abilityResult as any), suppressedByImpairment: true },
        },
      };
    }
  }

  const { meta, snapshot } = context;
  const result = meta.abilityResult;

  if (!result?.shouldDrunkEveryone) {
    return context;
  }

  // 找出所有需要醉酒的玩家（除吟游诗人和旅行者外）
  const drunkTargetIds = snapshot.seats
    .filter(
      (seat) =>
        seat.id !== result.minstrelSeatId &&
        seat.roleType !== "traveler" &&
        !seat.isDead &&
        ((seat as any).isDead !== true)
    )
    .map((seat) => seat.id);

  return {
    ...context,
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "MARK_ALL_FOR_DRUNK",
        targetIds: drunkTargetIds,
        reason: "吟游诗人的能力触发",
      },
    },
  };
};

export const minstrelAbility = createRoleAbility({
  roleId: "minstrel",
  abilityId: "minstrel_execution_ability",
  abilityName: "醉人的乐章",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.minstrel.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckOnExecution],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result.shouldDrunkEveryone) {
        console.log(
          `吟游诗人（${result.minstrelSeatId + 1}号）的能力触发！爪牙${
            result.executedSeatId + 1
          }号被处决，所有人（除吟游诗人和旅行者）醉酒到明天黄昏！`
        );
      }
      return context;
    },
  ],
});
