/**
 * 守鸦人（Ravenkeeper）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否在今晚死亡、是否醉酒/中毒
const preCheckDeathAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  // 守鸦人只有在今晚死亡时才会触发技能
  const diedTonight = seat?.diedAtNight === snapshot.nightCount;
  if (!diedTonight) {
    return {
      ...context,
      aborted: true,
      abortReason: "守鸦人今晚未死亡，技能不触发",
    };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

// 计算结果：获取目标真实身份，醉酒/中毒时返回虚假身份
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta } = context;
  const targetSeat = snapshot.seats.find((s) => s.id === targetIds[0]);
  const isAbilityActive = meta.isAbilityActive ?? true;

  let resultRole;

  if (!isAbilityActive) {
    // 醉酒/中毒时返回随机伪造身份或说书人输入
    resultRole =
      context.storytellerInput?.fakeRole ??
      snapshot.seats.filter((s) => s.id !== targetIds[0])[
        Math.floor(Math.random() * snapshot.seats.length)
      ].role;
  } else {
    // 正常情况返回真实身份，隐士可被视为邪恶身份
    resultRole = targetSeat?.role;
    // 隐士伪装逻辑：50%概率返回邪恶身份
    if (targetSeat?.role.id === "recluse" && Math.random() > 0.5) {
      const evilRoles = snapshot.seats
        .filter((s) => s.role.type === "minion" || s.role.type === "demon")
        .map((s) => s.role);
      if (evilRoles.length > 0) {
        resultRole = evilRoles[Math.floor(Math.random() * evilRoles.length)];
      }
    }
  }

  return { ...context, meta: { ...context.meta, abilityResult: resultRole } };
};

export const ravenkeeperAbility = createRoleAbility({
  roleId: "ravenkeeper",
  abilityId: "ravenkeeper_death_ability",
  abilityName: "亡者低语",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 40,
  firstNightOnly: false,
  wakePromptId: "role.ravenkeeper.trigger",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [preCheckDeathAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta, targetIds } = context;
      const targetId = targetIds?.[0];
      if (meta.isAbilityActive && targetId && meta.abilityResult) {
        console.log(
          `守鸦人查验${targetId}号玩家的身份是${meta.abilityResult.name}`
        );
      }
      return context;
    },
  ],
});
