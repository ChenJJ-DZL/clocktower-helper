/**
 * 暴乱（Riot）新引擎技能实现
 *
 * 【角色能力】"第3天起，被提名的玩家必须立即提名另一名玩家（不能拒绝）。
 *   如果无人可提名，邪恶阵营获胜。"
 *
 * PASSIVE + DAY 触发：第3天起激活暴乱模式，提名即刻转刀。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const RIOT_START_DAY = 3;

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const currentDay =
    (ctx.snapshot as any).dayCount ?? ctx.snapshot.nightCount ?? 1;
  const riotActive = currentDay >= RIOT_START_DAY;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        riotActive,
        currentDay,
        startDay: RIOT_START_DAY,
        daysSinceRiot: Math.max(0, currentDay - RIOT_START_DAY),
      },
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
      riotActive: r?.riotActive ?? false,
      riotStartDay: RIOT_START_DAY,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        riot: r,
      },
    },
    meta: { ...ctx.meta, riotResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.riotActive
    ? `[Riot] 暴乱已激活 — 第${r.currentDay}天（第${r.daysSinceRiot + 1}天暴乱）`
    : `[Riot] 暴乱未激活 — 第${r?.currentDay ?? 1}天（第${RIOT_START_DAY}天开始）`;
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const riotAbility = createRoleAbility({
  roleId: "riot",
  abilityId: "riot_passive",
  abilityName: "暴乱",
  triggerTiming: [AbilityTriggerTiming.PASSIVE, AbilityTriggerTiming.DAY],
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
