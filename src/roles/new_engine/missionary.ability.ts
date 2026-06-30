/**
 * 传教士（Missionary）新引擎技能实现
 *
 * 每个夜晚，你要选择一名玩家：如果你选择了一名爪牙，
 * 他会得知他被传教士选中。被选中的爪牙会失去能力。
 */

import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

export const missionaryAbility = createRoleAbility({
  roleId: "missionary",
  abilityId: "missionary_night_ability",
  abilityName: "传教",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.missionary.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [async (ctx) => {
    const { targetIds, snapshot } = ctx;
    const targetId = targetIds?.[0];
    if (targetId === undefined) return { ...ctx, aborted: true, abortReason: "未选择目标" };
    const target = snapshot.seats.find((s: any) => s.id === targetId);
    if (!target) return { ...ctx, aborted: true, abortReason: "目标不存在" };
    const isMinion = target.role?.type === "minion";
    return { ...ctx, meta: { ...ctx.meta, abilityResult: { targetId, isMinion, isBlocked: isMinion } } };
  }],
  stateUpdate: [async (ctx) => {
    const r = ctx.meta.abilityResult;
    if (!r?.isMinion) return ctx;
    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        seats: ctx.snapshot.seats.map((s: any) =>
          s.id === r.targetId ? { ...s, statusEffects: [...(s.statusEffects || []), { type: "blocked", source: "missionary" }] } : s
        ),
      },
    };
  }],
  postProcess: [async (ctx) => {
    const r = ctx.meta.abilityResult;
    if (r?.isMinion) console.log("[Missionary] 选中的爪牙能力被封禁");
    return ctx;
  }],
});
