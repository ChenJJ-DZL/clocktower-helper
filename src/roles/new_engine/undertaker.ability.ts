/**
 * 送葬者（Undertaker）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒/中毒、当日是否有处决玩家
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
  const executedPlayer = snapshot.seats.find((s) => s.executedToday);

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      executedPlayer,
    },
  };
};

// 计算要展示的角色信息（支持隐士伪装、醉酒/中毒虚假结果）
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const executedPlayer = meta.executedPlayer;

  if (!isAbilityActive || !executedPlayer) {
    return { ...context, meta: { ...context.meta, resultRole: null } };
  }

  let resultRole = executedPlayer.role;

  // 隐士伪装：可能被识别为爪牙或恶魔
  if (executedPlayer.role.id === "recluse") {
    const evilRoles = snapshot.seats.filter(
      (s) => s.role.type === "minion" || s.role.type === "demon"
    );
    if (Math.random() < 0.5 && evilRoles.length > 0) {
      resultRole = evilRoles[Math.floor(Math.random() * evilRoles.length)].role;
    }
  }

  // 醉酒/中毒时返回随机错误角色
  if (meta.isDrunk || meta.isPoisoned) {
    const randomRole =
      snapshot.seats[Math.floor(Math.random() * snapshot.seats.length)].role;
    resultRole = randomRole;
  }

  return { ...context, meta: { ...context.meta, resultRole } };
};

export const undertakerAbility = createRoleAbility({
  roleId: "undertaker",
  abilityId: "undertaker_night_ability",
  abilityName: "殓尸人",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 30,
  firstNightOnly: false,
  wakePromptId: "role.undertaker.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta } = context;
      if (meta.resultRole) {
        console.log(`送葬者得知今日被处决玩家的角色为${meta.resultRole.name}`);
      } else if (meta.executedPlayer) {
        console.log("送葬者今日未得知处决玩家信息（技能失效）");
      } else {
        console.log("今日无玩家被处决，送葬者技能不触发");
      }
      return context;
    },
  ],
});
