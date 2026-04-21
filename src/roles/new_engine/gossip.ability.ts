/**
 * 造谣者（Gossip）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：造谣者的能力由公开声明触发
const preCheckPublic = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isPublic: true } };
};

// 计算结果：检查声明是否正确
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;

  // 获取造谣者座位
  const gossipSeatId = context.actionNode.seatId;

  // 获取公开声明内容
  const statement = storytellerInput?.statement;
  const isStatementTrue = storytellerInput?.isStatementTrue ?? false;

  const result = {
    gossipSeatId,
    statement,
    isStatementTrue,
    shouldKill: isStatementTrue,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果声明正确，则选择一名玩家死亡
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  if (!result?.shouldKill) {
    return context;
  }

  // 造谣者选择目标会在UI中完成
  // 这里只传递需要更新的信息
  const targetId = context.targetIds?.[0];

  return {
    ...context,
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "MARK_FOR_DEATH",
        targetId,
        reason: "造谣者的声明正确",
      },
    },
  };
};

export const gossipAbility = createRoleAbility({
  roleId: "gossip",
  abilityId: "gossip_statement_ability",
  abilityName: "谣言",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 73,
  firstNightOnly: false,
  wakePromptId: "role.gossip.wake",
  targetConfig: {
    min: 0,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckPublic],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result.shouldKill) {
        console.log(`造谣者（${result.gossipSeatId + 1}号）的声明正确！`);
      } else {
        console.log(`造谣者（${result.gossipSeatId + 1}号）的声明错误`);
      }
      return context;
    },
  ],
});
