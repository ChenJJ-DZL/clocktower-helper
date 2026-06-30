/**
 * 帽匠（Hatter）新引擎技能实现
 *
 * 【角色能力】"如果你死亡，所有邪恶玩家（爪牙+恶魔）可以交换角色。"
 *
 * PASSIVE/ON_DEATH 触发：死亡时标记 hatterDied，角色交换由说书人手动操作。
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
    meta: {
      ...ctx.meta,
      abilityResult: { hatterDied: true, swapEnabled: true },
    },
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
      hatterDied: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        hatter: r,
      },
    },
    meta: { ...ctx.meta, hatterResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[帽匠] 死亡，邪恶玩家可交换角色";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "帽匠已死亡，所有邪恶玩家可以交换角色。",
      abilityLog: log,
    },
  };
};

export const hatterAbility = createRoleAbility({
  roleId: "hatter",
  abilityId: "hatter_swap",
  abilityName: "死后邪恶换角",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 5,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
