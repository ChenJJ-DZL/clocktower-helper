/**
 * 共情者（Empath）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒/中毒
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

// 计算结果：正常返回邻座邪恶数量，醉酒/中毒时返回虚假数字
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  let evilNeighborCount: number;

  if (!isAbilityActive || !seat) {
    // 醉酒/中毒时返回虚假信息，由说书人输入或随机生成0-2的数字
    evilNeighborCount =
      context.storytellerInput?.fakeResult ?? Math.floor(Math.random() * 3);
  } else {
    // 正常情况：计算左右相邻玩家中的邪恶数量
    evilNeighborCount = meta.empathResult ?? 0;
  }

  return {
    ...context,
    meta: { ...context.meta, abilityResult: evilNeighborCount },
  };
};

export const empathAbility = createRoleAbility({
  roleId: "empath",
  abilityId: "empath_night_ability",
  abilityName: "邪恶邻座感知",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 20,
  firstNightOnly: false,
  wakePromptId: "role.empath.wake",
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
      console.log(
        `共情者获得信息：你的邻座中有${meta.abilityResult}名邪恶玩家`
      );
      return context;
    },
  ],
});
