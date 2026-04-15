/**
 * 村夫（Villager）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  // 村夫的特殊醉酒机制：如果有多个村夫，其中一个会醉酒
  const villagerCount = snapshot.seats.filter(
    (s) => s.roleId === "villager" && s.isAlive
  ).length;

  // 检查这个村夫是否是醉酒的那个
  const isVillagerDrunk =
    (villagerCount > 1 &&
      seat.statusDetails?.some((d: any) => d.type === "villager_drunk")) ||
    false;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk: isDrunk || isVillagerDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned || isVillagerDrunk),
      villagerCount,
    },
  };
};

// 计算结果：得知目标玩家阵营
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  // 获取目标玩家（由说书人选择或随机选择
  const targetSeatId =
    context.storytellerInput?.targetSeatId ??
    snapshot.seats.find((s) => s.isAlive && s.id !== actionNode.seatId)?.id;

  const targetSeat = snapshot.seats.find((s) => s.id === targetSeatId);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标玩家" };
  }

  let isEvil: boolean;

  if (!isAbilityActive) {
    // 醉酒/中毒时，可能返回错误信息
    const realIsEvil = targetSeat.alignment === "evil";
    // 50%概率返回错误信息
    isEvil =
      context.storytellerInput?.fakeAlignment ??
      (Math.random() < 0.5 ? !realIsEvil : realIsEvil);
  } else {
    // 正常情况：返回真实阵营
    isEvil = targetSeat.alignment === "evil";
  }

  const result = {
    targetSeatId,
    isEvil,
    isDrunk: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const villagerAbility = createRoleAbility({
  roleId: "villager",
  abilityId: "villager_night_ability",
  abilityName: "阵营感知",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 5,
  firstNightOnly: false,
  wakePromptId: "role.villager.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      const alignmentText = result.isEvil ? "邪恶" : "善良";
      const drunkText = result.isDrunk ? "（醉酒）" : "";
      console.log(
        `村夫${drunkText}得知${result.targetSeatId + 1}号玩家是${alignmentText}阵营`
      );
      return context;
    },
  ],
});
