/** 游侠（Ranger）新引擎技能实现
 * 【角色能力】官方：「每局游戏限一次，在夜晚时，你可以选择一名存活的玩家：
 * 如果你选中了落难少女，她会变成一个不在场的镇民角色。[+落难少女]」
 *
 * 🔴 孤儿审计（2026-10-08）重写：此前是 PASSIVE 空壳（无存活拦截/不消费目标/不落地状态）。
 * 行动型管道：preCheck 存活+门控 → calc 判定目标是否落难少女 → stateUpdate 落地变身。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 全局有效性门控（effect_gate_contract：消费 abilityEffective） */
const gate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const effective = ctx.meta.abilityEffective ?? true;
  if (!effective) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "游侠醉酒或中毒，能力失效",
    };
  }
  return ctx;
};

/** 计算：目标是否落难少女 */
const calc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? null;
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : undefined;
  const isDamsel = target?.role?.id === "damsel";
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      targetId,
      abilityResult: { targetId, isDamsel, transformed: isDamsel },
    },
  };
};

/** 状态落地：落难少女 → 变为不在场的镇民（官方语义：替换其角色标记） */
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.transformed || r.targetId == null) {
    return {
      ...ctx,
      meta: { ...ctx.meta, rangerResult: r },
    };
  }
  const seats = (ctx.snapshot.seats as any[]).map((s) =>
    s.id === r.targetId
      ? {
          ...s,
          role: { id: "ranger_target_townsfolk", name: "镇民", type: "townsfolk" },
          statusEffects: [
            ...(s.statusEffects ?? []),
            { type: "ranger_transformed", source: "ranger", sourceSeatId: ctx.actionNode.seatId },
          ],
        }
      : s
  );
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        ranger: r,
      },
    },
    meta: { ...ctx.meta, rangerResult: r },
  };
};

const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetId = r?.targetId;
  const log = targetId != null
    ? `[Ranger] 指向 ${targetId + 1}号${r?.isDamsel ? "（落难少女 → 变为不在场镇民）" : "（非落难少女）"}`
    : "[Ranger] 未指向任何玩家";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: targetId != null
        ? `唤醒${ctx.actionNode.seatId + 1}号【游侠】，选择一名存活的玩家：若他是落难少女，她会变成一个不在场的镇民角色（每局一次）。`
        : `唤醒${ctx.actionNode.seatId + 1}号【游侠】。`,
      displayInfo: {
        type: "ranger_guess",
        targetId: targetId ?? null,
        isDamsel: !!r?.isDamsel,
        log,
      },
    },
  };
};

export const rangerAbility = createRoleAbility({
  roleId: "ranger",
  abilityId: "ranger_night_check",
  abilityName: "游侠排查",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 30,
  otherNightPriority: 30,
  firstNightOnly: false,
  wakePromptId: "role.ranger.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, gate],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
