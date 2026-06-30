/**
 * 报丧女妖（Banshee）新引擎技能实现（实验角色）
 *
 * 【角色能力】"如果被恶魔杀死，在白天觉醒并宣布此事。"
 *
 * ON_DEATH 触发：被恶魔杀死时，在白天的特定阶段觉醒并宣布。
 * 本实现记录死亡来源，供日间逻辑使用。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat) return { ...ctx, aborted: true, abortReason: "未找到座位" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 检测是否被恶魔杀死
  const killerRole =
    ctx.meta.killerRole ?? ctx.actionNode.meta?.killerRole ?? "";
  const killedByDemon =
    killerRole === "demon" || ctx.meta.killedByDemon === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { killedByDemon, bansheeAwakened: killedByDemon },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.bansheeAwakened) return ctx;
  return {
    ...ctx,
    meta: { ...ctx.meta, bansheeResult: r },
    snapshot: {
      ...ctx.snapshot,
      bansheeAwakened: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        banshee: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.bansheeAwakened) return ctx;
  const log = "[Banshee] 被恶魔杀死，在白天觉醒";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "报丧女妖被恶魔杀死，在白天的阶段宣布此事。",
      abilityLog: log,
    },
  };
};

export const bansheeAbility = createRoleAbility({
  roleId: "banshee",
  abilityId: "banshee_death_awaken",
  abilityName: "报丧觉醒",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  firstNightPriority: null,
  otherNightPriority: 86,
  firstNightOnly: false,
  wakePromptId: "role.banshee.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
