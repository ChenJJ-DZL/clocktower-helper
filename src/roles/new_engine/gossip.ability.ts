/**
 * 造谣者（Gossip）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：造谣者的能力由公开声明触发
const preCheckPublic = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  // 🔧 死亡玩家不能发动能力
  if (!seat || seat.isDead) {
    return {
      ...context,
      aborted: true,
      abortReason: "造谣者已死亡，无法使用能力",
    };
  }

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

  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：
   *   本 `stateUpdate` 此前**完全不消费 `ctx.meta.abilityEffective`**
   *   ⇒ 中毒/醉酒的该角色照样施加效果（与已修的 cerenovus / vortox 同类）。
   *
   * 🔒 blocked 分支**只记「选择」与「已受干扰」**，刻意**不写**：
   *   · `snapshot.seats`（死亡 / 状态效果本身就是"效果"，写了就等于能力生效）
   *   · 各角色的特征副作用字段（如相邻中毒名单 / 变身标记 / 交换标记）
   *   ⇒ 说书人能看到技能被发动过，但世界没有变化。
   */

  const abilityEffective = context.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    return {
      ...context,
      snapshot: {
        ...context.snapshot,
        lastKill: {
          demonId: context.actionNode.seatId,
          targetId: null,
          demonRole: "gossip",
          killed: false,
        },
        _abilityResults: {
          ...((context.snapshot as any)._abilityResults ?? {}),
          gossip: { ...result, blockedByDrunkOrPoison: true },
        },
      },
      meta: { ...context.meta, isCorrupted: true },
    };
  }

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
  firstNightPriority: null,
  otherNightPriority: 73,
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
      const log = result.shouldKill
        ? `造谣者（${result.gossipSeatId + 1}号）的声明正确！`
        : `造谣者（${result.gossipSeatId + 1}号）的声明错误`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          abilityLog: log,
          displayInfo: {
            type: "gossip_info",
            correct: result.shouldKill,
            log,
          },
        },
      };
    },
  ],
});
