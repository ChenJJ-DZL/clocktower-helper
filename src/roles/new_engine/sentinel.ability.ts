/**
 * 哨兵（Sentinel）寓言角色实现
 *
 * 【角色能力】开局发牌允许外来者数量修正 ±1。
 * 被动触发，说书人配置阶段决定增减外来者。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const adjustment = (ctx.storytellerInput?.sentinelAdjustment as number) ?? 0;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        sentinelActive: true,
        outsiderAdjustment: Math.max(-1, Math.min(1, adjustment)),
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      sentinelActive: true,
      sentinelAdjustment: r?.outsiderAdjustment ?? 0,
    },
    meta: { ...ctx.meta, sentinelResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const adj = r?.outsiderAdjustment ?? 0;
  const log = `[Sentinel] 哨兵生效 — 外来者数量${adj > 0 ? "+" : ""}${adj}修正`;
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const sentinelAbility = createRoleAbility({
  roleId: "sentinel",
  abilityId: "sentinel_passive",
  abilityName: "哨兵",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  otherNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
