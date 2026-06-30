/**
 * 魔术师（Conjurer）新引擎技能实现
 *
 * 【角色能力】游戏开始时，选择一名玩家（可以是自己）。在该游戏中，该玩家被提名时可以投3票而非1票。
 *
 * 这是游戏准备阶段的Setup能力，选择一名玩家获得额外投票权。
 * allowSelf: true — 可以选择自己。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        extraVoteGranted: targetId !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.extraVoteGranted) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        conjurer: r,
      },
      // 标记目标玩家拥有额外投票权
      extraVoteTarget: r.targetId,
    },
    meta: { ...ctx.meta, conjurerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.extraVoteGranted
    ? `[魔术师] ${r.targetId + 1}号获得额外投票权`
    : "[魔术师] 未选择目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: r?.extraVoteGranted
        ? `唤醒${ctx.actionNode.seatId + 1}号【魔术师】选择一名玩家获得额外投票权。`
        : `唤醒${ctx.actionNode.seatId + 1}号【魔术师】，确认是否选择目标。`,
      abilityLog: log,
    },
  };
};

export const conjurerAbility = createRoleAbility({
  roleId: "conjurer",
  abilityId: "conjurer_setup",
  abilityName: "额外投票",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.conjurer.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
