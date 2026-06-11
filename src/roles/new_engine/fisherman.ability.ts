/**
 * 渔夫（Fisherman）新引擎技能实现
 *
 * 【角色能力】"每局游戏限一次，在白天时，你可以向说书人咨询以获得建议。"
 *
 * 白天限次能力。每局仅可询问一次，说书人必须如实回答。
 * 使用后标记已消耗。
 */
import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用过能力
const preCheckLimitedAbility = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;
  const seatId = actionNode.seatId;

  if (!canUseLimitedAbility(seatId, "fisherman_advice")) {
    return {
      ...context,
      aborted: true,
      abortReason: "渔夫已经使用过能力了",
    };
  }

  return context;
};

// 计算结果：从 storytellerInput 中读取说书人的回答
const calculate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const advice = context.storytellerInput?.advice ?? "说书人的建议";
  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: { advice, used: true },
    },
  };
};

// 状态更新：标记能力已使用
const markAbilityUsed = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;

  if (!context.aborted) {
    consumeLimitedAbility(actionNode.seatId, "fisherman_advice");
  }

  return context;
};

// 持久化结果
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        fisherman: r,
      },
    },
  };
};

// 后处理：输出信息
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  const log = `[Fisherman] ${context.actionNode.seatId + 1}号渔夫向说书人寻求了建议：${r?.advice ?? "无"}`;
  console.log(log);
  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: `唤醒${context.actionNode.seatId + 1}号【渔夫】，说书人请回答他的问题。`,
      abilityLog: log,
    },
  };
};

export const fishermanAbility = createRoleAbility({
  roleId: "fisherman",
  abilityId: "fisherman_advice",
  abilityName: "渔夫咨询",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.fisherman.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculate],
  stateUpdate: [markAbilityUsed, stateUpdate],
  postProcess: [postProcess],
});
