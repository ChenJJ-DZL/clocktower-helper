/**
 * 星象师（Astrologer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一名玩家（可以是自己）：你猜测该名玩家的阵营
 * （善良或邪恶）。说书人会告知你的猜测是否正确。"
 *
 * 每夜选择一名玩家并猜测其阵营，说书人反馈是否正确。
 * 首夜不行动（* 标记）。
 * 选择+反馈类 → 弹窗。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件：存活 + 首夜跳过 ──────────────────────────────────────

const preCheckFirstNightSkip = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 非首夜检查：Astrologer 标有 *，首夜不行动
  const nightCount = context.snapshot.nightCount ?? 0;
  if (nightCount <= 1) {
    return { ...context, aborted: true, abortReason: "首夜不行动" };
  }
  return context;
};

// ─── 计算结果中间件 ──────────────────────────────────────────────────────

const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds, storytellerInput } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 获取目标
  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s: any) => s.id === targetId);
  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  // 获取玩家的阵营猜测（由说书人输入）
  const guess: string = storytellerInput?.guess ?? "good";

  // 判断目标实际阵营
  const targetRoleType = targetSeat.role?.type ?? "";
  const isEvil = targetRoleType === "minion" || targetRoleType === "demon";
  const actualAlignment = isEvil ? "evil" : "good";

  // 判断猜测是否正确
  let isCorrect = guess === actualAlignment;

  // 醉酒/中毒时反转结果（告知错误信息）
  if (!isAbilityActive) {
    isCorrect = !isCorrect;
  }

  const result = {
    targetId,
    guess,
    actualAlignment,
    isCorrect,
    isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────────

const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;
  if (!result) return context;

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        astrologer: result,
      },
    },
  };
};

// ─── 后处理中间件 ────────────────────────────────────────────────────────

const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const result = meta.abilityResult;
  if (!result) return context;

  const statusSuffix = result.isAbilityActive
    ? ""
    : "（醉酒/中毒，结果被反转）";
  const correctText = result.isCorrect ? "正确" : "错误";
  const log =
    `[Astrologer] ${actionNode.seatId + 1}号猜测${result.targetId + 1}号为【${result.guess}】` +
    `，实际为【${result.actualAlignment}】，${correctText}${statusSuffix}`;

  console.log(log);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt:
        `唤醒${actionNode.seatId + 1}号【星象师】选择目标并告知其猜测（善良/邪恶）。` +
        `说书人反馈：猜测${correctText}${result.isAbilityActive ? "" : "（因醉酒/中毒，反馈已被反转）"}。`,
      abilityLog: log,
    },
  };
};

// ─── 导出能力定义 ────────────────────────────────────────────────────────

export const astrologerAbility = createRoleAbility({
  roleId: "astrologer",
  abilityId: "astrologer_guess_ability",
  abilityName: "阵营猜测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 50,
  firstNightOnly: false,
  wakePromptId: "role.astrologer.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive, preCheckFirstNightSkip],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
