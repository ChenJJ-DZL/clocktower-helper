/**
 * 水手（Sailor）新引擎技能实现
 */

import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * 能力失效（醉酒/中毒）时，水手究竟让谁醉酒 —— 说书人在自己与目标之间随机选一个。
 *
 * ⚠️ 该随机值会在「当前的行动」提示预演与「实际执行」两处各算一次，
 * 必须使用确定性随机，否则提示与结果不一致（见 core/deterministicRandom.ts）。
 */
export function pickDrunkIdWhenInactive(
  selfSeatId: number,
  targetId: number,
  rng: DeterministicRandom = Math.random
): number {
  return rng() < 0.5 ? selfSeatId : targetId;
}

// 计算结果：选择目标并决定谁醉酒
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 获取水手座位
  const sailorSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  if (!sailorSeat) {
    return { ...context, aborted: true, abortReason: "未找到水手座位" };
  }

  // 获取目标座位
  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  // 🎲 确定性随机：同一夜、同一角色的重复计算（提示预演 / 实际执行）必须一致
  const rng = createDeterministicRandom(
    nightInfoSeed("sailor", actionNode.seatId, snapshot.nightCount ?? 1)
  );

  let drunkId: number;
  let drunkReason: string;

  if (!isAbilityActive) {
    // 醉酒/中毒时，能力失效，可能随机选择
    drunkId = pickDrunkIdWhenInactive(actionNode.seatId, targetId, rng);
    drunkReason = "（醉酒/中毒中）";
  } else {
    // 正常逻辑：如果目标是镇民，则目标醉酒；否则自身醉酒
    const targetIsTownsfolk = targetSeat.role?.type === "townsfolk";
    drunkId = targetIsTownsfolk ? targetId : actionNode.seatId;
    drunkReason = targetIsTownsfolk
      ? "（目标为镇民，目标醉酒）"
      : "（目标非镇民，水手醉酒）";
  }

  const result = {
    targetId,
    drunkId,
    drunkReason,
    isDrunk: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：应用醉酒效果
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  if (result?.drunkId == null) {
    return context;
  }

  // 状态落地：给醉酒者加 drunk 标记（此前只透传 stateUpdates → I11 空转）
  const seats = (context.snapshot.seats ?? []) as any[];
  const targetIdx = seats.findIndex((s) => s.id === result.drunkId);
  if (targetIdx < 0) return context;
  const target = seats[targetIdx];
  const effects = [...(target.statusEffects ?? [])];
  if (!effects.some((e: any) => e.type === "drunk")) {
    effects.push({
      type: "drunk",
      source: "sailor",
      sourceSeatId: context.actionNode.seatId,
    });
  }
  const nextSeats = [...seats];
  nextSeats[targetIdx] = { ...target, isDrunk: true, statusEffects: effects };

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      seats: nextSeats,
    },
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "ADD_DRUNK",
        targetId: result.drunkId,
        reason: "水手致醉",
        duration: "黄昏",
      },
    },
  };
};

export const sailorAbility = createRoleAbility({
  roleId: "sailor",
  effectSemantics: "drunk",
  abilityId: "sailor_night_ability",
  abilityName: "醉酒保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 23,
  otherNightPriority: 8,
  firstNightOnly: false,
  wakePromptId: "role.sailor.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      console.log(
        `水手${result.isDrunk ? "（醉酒）" : ""}选择了${result.targetId + 1}号，${result.drunkId + 1}号醉酒至下个黄昏${result.drunkReason}`
      );
      return context;
    },
  ],
});
