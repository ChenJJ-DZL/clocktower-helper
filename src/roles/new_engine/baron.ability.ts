/**
 * 男爵（Baron）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：游戏设置阶段
const preCheckSetupPhase = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive || snapshot.gamePhase !== "setup") {
    return { ...context, aborted: true, abortReason: "不在设置阶段，技能失效" };
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

// 状态更新：增加两个外来者名额
const addOutsiderSlots = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  if (!isAbilityActive) {
    return context;
  }

  // 创建新快照：增加两个外来者名额，减少两个镇民名额
  const newSnapshot = {
    ...snapshot,
    setupConfig: {
      ...(snapshot as any).setupConfig,
      outsiderCount: ((snapshot as any).setupConfig?.outsiderCount ?? 0) + 2,
      townsfolkCount: Math.max(
        0,
        ((snapshot as any).setupConfig?.townsfolkCount ?? 0) - 2
      ),
    },
  };

  return { ...context, snapshot: newSnapshot as any };
};

export const baronAbility = createRoleAbility({
  roleId: "baron",
  abilityId: "baron_outsider_boost",
  abilityName: "外来者增幅",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: true,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckSetupPhase],
  calculate: [],
  stateUpdate: [addOutsiderSlots],
  postProcess: [
    async (context) => {
      if (context.meta.isAbilityActive) {
        console.log("男爵在场，外来者名额增加2个");
      }
      return context;
    },
  ],
});
