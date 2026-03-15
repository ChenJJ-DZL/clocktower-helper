/**
 * 图书管理员（Librarian）新引擎技能实现
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

// 计算结果：正常返回真实信息，醉酒/中毒时返回虚假信息
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  let result: { seat1: string; seat2: string; outsiderName: string };

  if (!isAbilityActive) {
    // 醉酒/中毒时返回虚假信息，由说书人输入或随机生成
    result = context.storytellerInput?.fakeResult ?? {
      seat1:
        snapshot.seats[Math.floor(Math.random() * snapshot.seats.length)].id,
      seat2:
        snapshot.seats[Math.floor(Math.random() * snapshot.seats.length)].id,
      outsiderName: "酒鬼",
    };
  } else {
    // 正常情况：从预设的首夜信息中获取两个玩家，其中一个是指定外来者
    result = meta.initialNightInfo?.librarianInfo ?? {
      seat1: "",
      seat2: "",
      outsiderName: "",
    };
  }

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const librarianAbility = createRoleAbility({
  roleId: "librarian",
  abilityId: "librarian_first_night_ability",
  abilityName: "外来者识别",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 11,
  firstNightOnly: true,
  wakePromptId: "role.librarian.wake",
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
        `图书管理员获得信息：${meta.abilityResult.seat1}号和${meta.abilityResult.seat2}号玩家中有一名是${meta.abilityResult.outsiderName}`
      );
      return context;
    },
  ],
});
