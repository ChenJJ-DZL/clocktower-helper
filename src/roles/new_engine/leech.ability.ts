/**
 * 痢蛭（Lleech）新引擎技能实现
 *
 * 每个夜晚*，你要选择一名玩家：你寄生该玩家。
 * 首夜你必须选择一名存活玩家。只有你寄生的玩家死亡后你才会死亡。
 */

import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

export const leechAbility = createRoleAbility({
  roleId: "leech",
  abilityId: "leech_night_ability",
  abilityName: "寄生",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.leech.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [async (ctx) => {
    const { targetIds } = ctx;
    const targetId = targetIds?.[0];
    if (targetId === undefined) return { ...ctx, aborted: true, abortReason: "未选择宿主" };
    return { ...ctx, meta: { ...ctx.meta, abilityResult: { hostId: targetId } } };
  }],
  stateUpdate: [async (ctx) => {
    const hostId = ctx.meta.abilityResult?.hostId;
    if (hostId === undefined) return ctx;
    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        seats: ctx.snapshot.seats.map((s: any) =>
          s.id === hostId ? { ...s, statusEffects: [...(s.statusEffects || []), { type: "leech_host", source: "leech" }] } : s
        ),
      },
      meta: { ...ctx.meta, prompt: "痢蛭选择了" + (hostId + 1) + "号作为宿主" },
    };
  }],
  postProcess: [async (ctx) => {
    const hostId = ctx.meta.abilityResult?.hostId;
    if (hostId !== undefined) console.log("[Leech] 宿主: " + (hostId + 1) + "号");
    return ctx;
  }],
});
