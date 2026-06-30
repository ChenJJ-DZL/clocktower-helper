/**
 * 利维坦（Leviathan）新引擎技能实现
 *
 * 【角色能力】"游戏在第4天自动结束。"
 *
 * 游戏规则修改器：设置游戏最大天数限制为4天。
 * 第4天白天结束时，游戏自动结束，邪恶阵营获胜。
 * 不主动唤醒，被动限制游戏时长。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const MAX_DAY = 4;

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        leviathanActive: true,
        maxDayCount: MAX_DAY,
        currentDay: ctx.snapshot.nightCount ?? 1,
        daysRemaining: Math.max(0, MAX_DAY - (ctx.snapshot.nightCount ?? 1)),
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
      leviathanActive: true,
      maxDayCount: MAX_DAY,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        leviathan: r,
      },
    },
    meta: { ...ctx.meta, leviathanResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Leviathan] 利维坦限时${MAX_DAY}天 — 第${r?.currentDay ?? "?"}天，剩余${r?.daysRemaining ?? "?"}天`;
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const leviathanAbility = createRoleAbility({
  roleId: "leviathan",
  abilityId: "leviathan_timer",
  abilityName: "利维坦限时",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 86,
  otherNightPriority: 118,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
