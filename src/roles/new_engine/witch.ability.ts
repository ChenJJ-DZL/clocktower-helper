/**
 * 女巫（Witch）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一名玩家：如果他明天白天发起提名，他死亡。
 *   如果只有三名存活的玩家，你失去此能力。"
 *
 * 每夜诅咒一名玩家，被诅咒者若发起提名则死亡。
 * targetConfig: min=1, max=1 需要玩家选择目标
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  // 三人局失去能力
  const aliveCount = ctx.snapshot.seats.filter((s: any) => s.isAlive).length;
  if (aliveCount <= 3) return { ...ctx, aborted: true, abortReason: "仅剩3名存活玩家，女巫失去能力" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return { ...ctx, meta: { ...ctx.meta, abilityResult: { targetId, cursed: true } } };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;
  return {
    ...ctx,
    meta: { ...ctx.meta, witchResult: r },
    snapshot: {
      ...ctx.snapshot,
      witchCurse: { ...((ctx.snapshot as any).witchCurse ?? {}), [r.targetId]: true },
      _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), witch: r },
    },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;
  const log = `[Witch] 诅咒 ${r.targetId + 1}号`;
  console.log(log);
  return {
    ...ctx, meta: {
      ...ctx.meta, prompt: `唤醒${ctx.actionNode.seatId + 1}号【女巫】，选择一名玩家进行诅咒。`,
      abilityLog: log,
    },
  };
};

export const witchAbility = createRoleAbility({
  roleId: "witch", abilityId: "witch_curse", abilityName: "恶咒",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 36, firstNightOnly: false,
  wakePromptId: "role.witch.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
