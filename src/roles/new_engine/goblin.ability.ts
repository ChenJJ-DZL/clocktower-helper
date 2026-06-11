/**
 * 哥布林（Goblin）新引擎技能实现
 *
 * 【角色能力】"如果你在白天被处决，你的阵营获胜。"
 *
 * PASSIVE 触发：被处决时标记 goblinExecuted，由引擎判定胜利。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { goblinExecuted: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      goblinExecuted: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        goblin: r,
      },
    },
    meta: { ...ctx.meta, goblinResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[哥布林] 被处决，邪恶阵营获胜";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "哥布林被处决，邪恶阵营获胜！",
      abilityLog: log,
    },
  };
};

export const goblinAbility = createRoleAbility({
  roleId: "goblin",
  abilityId: "goblin_execution",
  abilityName: "被处决则邪恶获胜",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
