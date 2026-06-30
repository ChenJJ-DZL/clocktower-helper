/**
 * 天降横祸（Deus Ex Fiasco）新引擎技能实现
 *
 * 【角色能力】"游戏结束时，随机一名玩家改变阵营。"
 *
 * 游戏结束时触发，随机选择一名存活玩家将其阵营翻转。
 * 属于奇遇（Fabled）角色，不参与正常游戏轮次唤醒。
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
  const aliveSeats = ctx.snapshot.seats.filter((s: any) => s.isAlive);
  const targetId =
    aliveSeats.length > 0
      ? aliveSeats[Math.floor(Math.random() * aliveSeats.length)].id
      : null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        chaosEvent: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.chaosEvent) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        deusExFiasco: r,
      },
    },
    meta: { ...ctx.meta, deusResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[天降横祸] 随机选中${r.targetId + 1}号，阵营翻转`
      : "[天降横祸] 无存活玩家";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "【天降横祸】触发：随机一名玩家改变阵营。",
      abilityLog: log,
    },
  };
};

export const deusExFiascoAbility = createRoleAbility({
  roleId: "deus_ex_fiasco",
  abilityId: "deus_chaos",
  abilityName: "天降横祸",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
