/**
 * 杂技演员（Acrobat）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，选择一名玩家：如果当晚他醉酒或中毒，你死亡。"
 *
 * 每夜选择一名玩家检测。如果该玩家醉酒或中毒，杂技演员死亡。
 * allowSelf: true — 可以检测自己
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
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const effects =
    target?.statusEffects ?? ctx.snapshot.statusEffects?.[targetId] ?? [];
  const isDrunkOrPoisoned = effects.some(
    (e: any) => e.type === "drunk" || e.type === "poisoned"
  );

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isDrunkOrPoisoned,
        acrobatDies: isDrunkOrPoisoned,
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
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        acrobat: r,
      },
    },
    meta: { ...ctx.meta, acrobatResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.isDrunkOrPoisoned ? "中毒/醉酒 → 杂技演员死亡" : "正常";
  const log = `[Acrobat] ${r?.targetId != null ? `${r.targetId + 1}号: ${status}` : "无目标"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【杂技演员】，选择一名玩家检测。`,
      abilityLog: log,
    },
  };
};

export const acrobatAbility = createRoleAbility({
  roleId: "acrobat",
  abilityId: "acrobat_detect",
  abilityName: "醉酒探测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 22,
  firstNightOnly: false,
  wakePromptId: "role.acrobat.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
