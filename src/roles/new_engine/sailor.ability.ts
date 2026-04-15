/**
 * 水手（Sailor）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

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

  let drunkId: number;
  let drunkReason: string;

  if (!isAbilityActive) {
    // 醉酒/中毒时，能力失效，可能随机选择
    drunkId = Math.random() < 0.5 ? actionNode.seatId : targetId;
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

  if (!result?.drunkId) {
    return context;
  }

  // 状态更新逻辑会在GameController中实现
  // 这里只传递需要更新的信息
  return {
    ...context,
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
  abilityId: "sailor_night_ability",
  abilityName: "醉酒保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 25,
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
