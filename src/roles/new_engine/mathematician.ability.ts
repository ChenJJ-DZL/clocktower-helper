/**
 * 数学家（Mathematician）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会得知有多少名玩家的能力因为与能力描述不符的方式而异常地生效了。"
 *
 * 每夜被动得知信息（不选目标），返回一个数字。
 * 该数字由 storyteller 计算或在 initialNightInfo 中预置。
 * 自动信息类，不弹窗。
 *
 * 注意：异常计数的实际计算逻辑非常复杂，需要遍历所有角色当晚的能力执行情况
 * 并与"正常"执行结果做比较。当前实现假设该值由外部（GameController / storyteller）
 * 在 snapshot.abnormalAbilityCount 中提供，后续可扩展为自主计算。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 计算结果：从snapshot中获取异常次数
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 从外部获取异常计数（storyteller 或 GameController 提供）
  const abnormalCount = snapshot.abnormalAbilityCount ?? 0;

  // 醉酒/中毒时可能看到错误数字
  let result: number;
  if (!isAbilityActive) {
    // 优先使用 storytellerInput 指定的虚假值
    const fakeResult = context.storytellerInput?.fakeResult;
    if (fakeResult !== undefined) {
      result = fakeResult;
    } else {
      // 否则生成一个不同的随机值（0-7之间，不等于真实值）
      const possible = [0, 1, 2, 3, 4, 5, 6, 7].filter(
        (n) => n !== abnormalCount
      );
      result = possible[Math.floor(Math.random() * possible.length)] ?? 0;
    }
  } else {
    result = abnormalCount;
  }

  const resultObj = {
    abnormalCount: result,
    actualCount: abnormalCount,
    isCorrupted: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: resultObj } };
};

// 状态更新：将结果存入snapshot
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        mathematician: result,
      },
    },
    meta: {
      ...context.meta,
      mathematicianResult: result,
    },
  };
};

// 后处理：日志输出
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const r = meta.abilityResult as any;
  const count = r?.abnormalCount ?? 0;
  const corruptedText = r?.isCorrupted ? "（信息可能被干扰）" : "";
  const log = `[Mathematician] 异常能力次数: ${count}${corruptedText}`;
  console.log(log);
  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: `告知${actionNode.seatId + 1}号【数学家】：今晚有 ${count} 名玩家的能力异常生效了。`,
      abilityLog: log,
    },
  };
};

export const mathematicianAbility = createRoleAbility({
  roleId: "mathematician",
  abilityId: "mathematician_count",
  abilityName: "数学统计",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  firstNightPriority: 84,
  otherNightPriority: 116,
  firstNightOnly: false,
  wakePromptId: "role.mathematician.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
