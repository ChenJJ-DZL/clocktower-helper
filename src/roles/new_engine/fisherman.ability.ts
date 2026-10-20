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
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isVortoxWorldActive } from "../../utils/vortoxWorld";
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
  /**
   * ⭐ 2026-10-20 修复（用户实测：涡流局信息并非 100% 错）：
   * 【官方原文·渔夫】"每局游戏限一次，在白天时，你可以让说书人给你一些能帮助你的阵营获胜的建议。"
   * ⇒ 信息类能力：受干扰（涡流/中毒/醉酒/能力失效）时**建议必须是错误/有害的**。
   *   建议是说书人自由文本，引擎无法自动取反 ⇒ 正确做法是打上 `isCorrupted/hasVortox`
   *   标记并让提示词**强制要求给出有害建议**（旧实现无论干扰与否都原样透传，真值直漏）。
   */
  const hasVortox =
    isVortoxWorldActive(context.snapshot.seats as any) ||
    Boolean((context.snapshot as any).isVortoxWorld);
  const isCorrupted =
    hasVortox ||
    context.meta?.isAbilityActive === false ||
    context.meta?.abilityEffective === false;

  const advice = context.storytellerInput?.advice ?? "说书人的建议";
  return {
    ...context,
    meta: {
      ...context.meta,
      isCorrupted,
      hasVortox,
      abilityResult: { advice, used: true, isCorrupted },
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
      prompt: r?.isCorrupted
        ? `唤醒${context.actionNode.seatId + 1}号【渔夫】。⚠️ 该渔夫能力受干扰（涡流/中毒/醉酒）：说书人**必须给出错误或有害的建议**（官方：信息类能力结果一定为假）。`
        : `唤醒${context.actionNode.seatId + 1}号【渔夫】，说书人请回答他的问题。`,
      abilityLog: log,
    },
  };
};

export const fishermanAbility = createRoleAbility({
  roleId: "fisherman",
  abilityId: "fisherman_advice",
  abilityName: "渔夫咨询",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: null,
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
