/**
 * 疯子（Lunatic）新引擎技能实现
 *
 * 【角色能力】"你以为自己是恶魔，但实际上你不是。你每晚醒来像恶魔一样
 *   选择目标。说书人会决定你的目标是否真的死亡。"
 *
 * 每夜模拟恶魔行动。实际效果由说书人决定。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        targetId, fakeKill: true,
        realKill: false, // 疯子从不真正杀人
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
      lunaticTarget: r?.targetId,
      _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), lunatic: r },
    },
    meta: { ...ctx.meta, lunaticResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Lunatic] 疯子模拟击杀: ${r?.targetId != null ? r.targetId + 1 + "号" : "无"}`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log, prompt: `唤醒${ctx.actionNode.seatId + 1}号【疯子】（假恶魔行动），选择一名玩家。` } };
};

export const lunaticAbility = createRoleAbility({
  roleId: "lunatic", abilityId: "lunatic_fake_kill", abilityName: "恶魔幻想",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT], wakePriority: 100, firstNightOnly: false,
  wakePromptId: "role.lunatic.wake", targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
