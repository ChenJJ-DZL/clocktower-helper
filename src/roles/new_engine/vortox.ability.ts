/**
 * 涡流（Vortox）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   镇民玩家的能力都会产生错误信息。
 *   如果白天没人被处决，邪恶阵营获胜。"
 *
 * 每夜杀一人。所有镇民能力结果反转。无处决日邪恶获胜。
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
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, killed: true, vortoxActive: true },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.killed) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        demonId: ctx.actionNode.seatId,
        targetId: r.targetId,
        demonRole: "vortox",
      },
      vortoxActive: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        vortox: r,
      },
    },
    meta: { ...ctx.meta, vortoxResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[Vortox] 击杀${r.targetId + 1}号（涡流在场，镇民信息均反转）`
      : "[Vortox] 无目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【涡流】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const vortoxAbility = createRoleAbility({
  roleId: "vortox",
  abilityId: "vortox_kill",
  abilityName: "混沌杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 52,
  firstNightOnly: false,
  wakePromptId: "role.vortox.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
