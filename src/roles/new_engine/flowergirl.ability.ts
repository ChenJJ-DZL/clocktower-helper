/**
 * 卖花女孩（Flowergirl）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你会得知恶魔今天是否投过票。"
 *
 * 每夜被动得知信息（不选目标），返回 boolean。
 * 如果醉酒/中毒/涡流在场，信息反转。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 计算结果：确定恶魔是否投过票
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 从snapshot中获取恶魔今天是否投票的信息
  const demonVotedToday = snapshot.demonVotedToday ?? false;

  // 涡流在场会使信息反转
  const hasVortox = snapshot.seats.some((s) => s.role?.id === "vortox");

  // 醉酒/中毒 或 涡流时，信息反转
  let hasVoted = demonVotedToday;
  if (!isAbilityActive || hasVortox) {
    hasVoted = !hasVoted;
  }

  const result = {
    hasVoted,
    actualVoted: demonVotedToday,
    isCorrupted: !isAbilityActive || hasVortox,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
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
        flowergirl: result,
      },
    },
    meta: {
      ...context.meta,
      flowergirlResult: result,
    },
  };
};

export const flowergirlAbility = createRoleAbility({
  roleId: "flowergirl",
  abilityId: "flowergirl_nightly_ability",
  abilityName: "投票侦测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 11,
  firstNightOnly: false,
  wakePromptId: "role.flowergirl.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult as any;
      const votedText = result?.hasVoted ? "有" : "没有";
      const corruptedText = result?.isCorrupted ? "（信息可能被干扰）" : "";
      const log = `[Flowergirl] 恶魔今天${votedText}投过票${corruptedText}`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          prompt: `告知${context.actionNode.seatId + 1}号【卖花女孩】：恶魔今天${votedText}投过票。`,
          abilityLog: log,
        },
      };
    },
  ],
});
