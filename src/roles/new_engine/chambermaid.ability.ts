/**
 * 侍女（Chambermaid）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 计算结果：选择两名玩家并计算被唤醒数量
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 获取侍女座位
  const chambermaidSeat = snapshot.seats.find(
    (s) => s.id === actionNode.seatId
  );
  if (!chambermaidSeat) {
    return { ...context, aborted: true, abortReason: "未找到侍女座位" };
  }

  // 验证目标数量
  if (!targetIds || targetIds.length !== 2) {
    return { ...context, aborted: true, abortReason: "需要选择2名玩家" };
  }

  // 计算被唤醒数量（这里简化实现，实际需要根据nightOrderParser来判断）
  let wokenCount = 0;

  if (isAbilityActive) {
    // 正常逻辑：需要实际查询夜晚顺序系统来判断目标是否会被唤醒
    // 暂时返回0作为占位，实际实现需要整合nightOrderParser
    wokenCount = 0;
  } else {
    // 醉酒/中毒时，可能返回错误结果
    wokenCount = Math.floor(Math.random() * 3); // 0-2的随机数
  }

  const result = {
    targetIds,
    wokenCount,
    isDrunk: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：侍女能力不需要修改游戏状态
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 侍女能力不需要修改游戏状态
  return context;
};

export const chambermaidAbility = createRoleAbility({
  roleId: "chambermaid",
  abilityId: "chambermaid_night_ability",
  abilityName: "夜间查验",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 51,
  firstNightOnly: false,
  wakePromptId: "role.chambermaid.wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: false,
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
        `侍女${result.isDrunk ? "（醉酒）" : ""}查验了${result.targetIds.map((t: number) => t + 1).join("、")}号，得知${result.wokenCount}人被唤醒`
      );
      return context;
    },
  ],
});
